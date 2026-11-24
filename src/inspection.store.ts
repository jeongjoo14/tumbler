import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  defectNames,
  type Inspection,
  type InspectionRecord,
  type InspectionRecordWithDefects,
  type LocalState,
  type RecordDefect,
} from './inspection.types';
import { GoogleWebAppClient } from './google-web-app.client';
import { getStorageInfo } from './storage-mode';

interface GoogleInspectionRow {
  inspection_id: string;
  product_id: string;
  inspected_at: string;
  revision: 'Rev.A' | 'Rev.B';
  weight_g: number | string | null;
  memo: string | null;
  decision: Inspection['decision'] | '';
  content_version: number | string;
}

interface GoogleRecordRow extends Omit<InspectionRecord, 'weight_g' | 'notes' | 'content_version' | 'change_reason'> {
  weight_g: number | string | null;
  notes: string | null;
  content_version: number | string;
  change_reason: string | null;
}

interface GoogleImageRow {
  inspection_id: string;
  position: number | string;
  image_url: string;
}

export interface GoogleInspectionData {
  inspections: GoogleInspectionRow[];
  images: GoogleImageRow[];
  inspection_records: GoogleRecordRow[];
  record_defects: RecordDefect[];
}

export interface GooglePhoto {
  mimeType: string;
  base64: string;
}

export interface PreparedPhoto {
  name: string;
  mimeType: string;
  base64: string;
}

@Injectable()
export class InspectionStore {
  private readonly filePath = path.join(process.cwd(), 'runtime', 'local-state.json');

  constructor(private readonly google: GoogleWebAppClient) {}

  async getAll(): Promise<Inspection[]> {
    if (getStorageInfo().storage === 'live') return this.getGoogleInspections();
    const state = this.readLocalState();
    return this.applyRecords(state.inspections, state.inspection_records, state.record_defects);
  }

  private readLocalState(): LocalState {
    const state = existsSync(this.filePath)
      ? (JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<LocalState>)
      : {};
    return {
      ...state,
      inspections: Array.isArray(state.inspections) ? state.inspections : [],
      inspection_records: Array.isArray(state.inspection_records) ? state.inspection_records : [],
      record_defects: Array.isArray(state.record_defects) ? state.record_defects : [],
    };
  }

  private writeLocalState(state: LocalState): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    renameSync(temporaryPath, this.filePath);
  }

  private sortRecords(records: InspectionRecord[]): InspectionRecord[] {
    return records
      .slice()
      .reverse()
      .sort((left, right) =>
        right.content_version - left.content_version ||
        right.recorded_at.localeCompare(left.recorded_at),
      );
  }

  private withDefects(record: InspectionRecord, recordDefects: RecordDefect[]): InspectionRecordWithDefects {
    return {
      ...record,
      defects: recordDefects
        .filter((item) => item.record_id === record.record_id)
        .map(({ defect_code }) => ({ defect_code, defect_name: defectNames[defect_code] ?? defect_code })),
    };
  }

  private applyRecords(
    inspections: Inspection[],
    records: InspectionRecord[],
    recordDefects: RecordDefect[],
  ): Inspection[] {
    return inspections.map((inspection) => {
      const last = this.sortRecords(
        records.filter((record) => record.inspection_id === inspection.inspection_id),
      )[0];
      if (!last) return { ...inspection, defects: [] };
      return {
        ...inspection,
        decision: last.decision,
        memo: last.notes,
        defects: this.withDefects(last, recordDefects).defects,
      };
    });
  }

  private recordsFromGoogle(rows: GoogleRecordRow[]): InspectionRecord[] {
    return rows.map((row) => ({
      record_id: row.record_id,
      inspection_id: row.inspection_id,
      user_id: row.user_id,
      recorded_at: row.recorded_at,
      decision: row.decision,
      weight_g: row.weight_g === '' || row.weight_g === null ? null : Number(row.weight_g),
      notes: String(row.notes ?? ''),
      content_version: Number(row.content_version) || 0,
      change_reason: String(row.change_reason ?? ''),
    }));
  }

  async listRecords(inspectionId: string): Promise<InspectionRecordWithDefects[]> {
    let records: InspectionRecord[];
    let recordDefects: RecordDefect[];
    if (getStorageInfo().storage === 'live') {
      const result = await this.google.call<{ records: GoogleRecordRow[]; defects: RecordDefect[] }>(
        'listInspectionRecords',
        { inspection_id: inspectionId },
      );
      records = this.recordsFromGoogle(result.records ?? []);
      recordDefects = result.defects ?? [];
    } else {
      const state = this.readLocalState();
      records = state.inspection_records.filter((record) => record.inspection_id === inspectionId);
      recordDefects = state.record_defects;
    }
    return this.sortRecords(records).map((record) => this.withDefects(record, recordDefects));
  }

  async saveRecord(record: InspectionRecord, defects: string[]): Promise<InspectionRecordWithDefects> {
    const recordDefects = defects.map((defect_code) => ({ record_id: record.record_id, defect_code }));
    if (getStorageInfo().storage === 'live') {
      await this.google.call('saveInspectionRecord', { record, defects });
    } else {
      const state = this.readLocalState();
      const inspection = state.inspections.find((item) => item.inspection_id === record.inspection_id);
      if (inspection) inspection.content_version = record.content_version;
      state.inspection_records.push(record);
      state.record_defects.push(...recordDefects);
      this.writeLocalState(state);
    }
    return this.withDefects(record, recordDefects);
  }

  private async getGoogleInspections(): Promise<Inspection[]> {
    const result = await this.google.call<GoogleInspectionData>('read', {
      tabs: ['inspections', 'images', 'inspection_records', 'record_defects'],
    });
    return this.fromGoogle(result);
  }

  fromGoogle(result: GoogleInspectionData): Inspection[] {
    const imagesByInspection = new Map<string, GoogleImageRow[]>();
    for (const image of result.images ?? []) {
      const images = imagesByInspection.get(image.inspection_id) ?? [];
      images.push(image);
      imagesByInspection.set(image.inspection_id, images);
    }

    const inspections = (result.inspections ?? []).map((row): Inspection => ({
      inspection_id: row.inspection_id,
      product_id: row.product_id,
      inspected_at: row.inspected_at,
      revision: row.revision,
      weight_g: row.weight_g === '' || row.weight_g === null ? null : Number(row.weight_g),
      memo: row.memo ?? '',
      decision: row.decision === '' ? null : row.decision,
      content_version: Number(row.content_version) || 0,
      images: (imagesByInspection.get(row.inspection_id) ?? [])
        .sort((left, right) => Number(left.position) - Number(right.position))
        .map((image) => image.image_url),
    }));
    return this.applyRecords(
      inspections,
      this.recordsFromGoogle(result.inspection_records ?? []),
      result.record_defects ?? [],
    );
  }

  private addLocal(inspection: Inspection): void {
    const state = this.readLocalState();
    state.inspections.push(inspection);
    this.writeLocalState(state);
  }

  async register(inspection: Inspection, photos: PreparedPhoto[]): Promise<Inspection> {
    if (photos.length === 0) throw new BadRequestException('사진을 골라 주세요.');

    if (getStorageInfo().storage === 'live') {
      if (inspection.weight_g !== null && inspection.weight_g < 0) {
        throw new BadRequestException('중량은 0 이상의 숫자로 적어 주세요.');
      }

      const uploadedPhotos: Array<{ id: string }> = [];
      for (const photo of photos) {
        uploadedPhotos.push(await this.google.call<{ id: string }>('savePhoto', {
          name: photo.name,
          mimeType: photo.mimeType,
          base64: photo.base64,
        }));
      }

      const savedInspection: Inspection = {
        ...inspection,
        images: uploadedPhotos.map(({ id }) => `/api/drive/${id}`),
      };
      await this.google.call('append', {
        rows: {
          inspections: [
            {
              inspection_id: savedInspection.inspection_id,
              product_id: savedInspection.product_id,
              inspected_at: savedInspection.inspected_at,
              revision: savedInspection.revision,
              weight_g: savedInspection.weight_g,
              memo: savedInspection.memo,
              decision: savedInspection.decision,
              content_version: savedInspection.content_version,
            },
          ],
          images: savedInspection.images.map((image_url, index) => ({
            inspection_id: savedInspection.inspection_id,
            position: index + 1,
            image_url,
          })),
        },
      });
      return savedInspection;
    }

    const savedInspection: Inspection = {
      ...inspection,
      images: photos.map((photo) => this.saveLocalPhoto(photo)),
    };
    this.addLocal(savedInspection);
    return savedInspection;
  }

  private saveLocalPhoto(photo: PreparedPhoto): string {
    const uploadsDirectory = path.join(process.cwd(), 'runtime', 'uploads');
    mkdirSync(uploadsDirectory, { recursive: true });
    writeFileSync(path.join(uploadsDirectory, photo.name), Buffer.from(photo.base64, 'base64'));
    return `/uploads/${photo.name}`;
  }

  async update(inspection: Inspection): Promise<void> {
    if (getStorageInfo().storage === 'live') {
      await this.google.call('update', {
        tab: 'inspections',
        key: 'inspection_id',
        value: inspection.inspection_id,
        changes: {
          product_id: inspection.product_id,
          inspected_at: inspection.inspected_at,
          weight_g: inspection.weight_g,
          content_version: inspection.content_version,
        },
      });
      return;
    }

    const state = this.readLocalState();
    const saved = state.inspections.find((item) => item.inspection_id === inspection.inspection_id);
    if (!saved) return;
    saved.product_id = inspection.product_id;
    saved.inspected_at = inspection.inspected_at;
    saved.weight_g = inspection.weight_g;
    saved.content_version = inspection.content_version;
    this.writeLocalState(state);
  }

  async getDrivePhoto(fileId: string): Promise<GooglePhoto> {
    return this.google.call<GooglePhoto>('getPhoto', { id: fileId });
  }

  async find(inspectionId: string): Promise<Inspection | undefined> {
    return (await this.getAll()).find((item) => item.inspection_id === inspectionId);
  }
}
