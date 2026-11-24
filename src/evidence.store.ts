import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { EvidenceLink, EvidenceQuery } from './evidence.types';
import type { GeminiResultRecord } from './gemini-result.types';
import { GeminiResultStore, type GoogleGeminiResultRecord } from './gemini-result.store';
import { GoogleWebAppClient } from './google-web-app.client';
import { InspectionStore, type GoogleInspectionData } from './inspection.store';
import type { Inspection } from './inspection.types';
import { getStorageInfo } from './storage-mode';

interface GoogleReviewData extends GoogleInspectionData {
  gemini_results: GoogleGeminiResultRecord[];
  evidence_queries: Array<Omit<EvidenceQuery, 'sources'> & { sources: unknown }>;
  evidence_links: EvidenceLink[];
}

export interface ReviewData {
  inspections: Inspection[];
  results: GeminiResultRecord[];
  queries: EvidenceQuery[];
  links: EvidenceLink[];
}

function findLatest<T extends { created_at: string }>(records: T[]): T | undefined {
  return records.reduce<T | undefined>(
    (latest, record) => (!latest || record.created_at >= latest.created_at ? record : latest),
    undefined,
  );
}

@Injectable()
export class EvidenceStore {
  private readonly runtimeDirectory = path.join(process.cwd(), 'runtime');
  private readonly queriesPath = path.join(this.runtimeDirectory, 'evidence-queries.json');
  private readonly linksPath = path.join(this.runtimeDirectory, 'evidence-links.json');

  constructor(
    private readonly google: GoogleWebAppClient,
    private readonly inspections: InspectionStore,
    private readonly geminiResults: GeminiResultStore,
  ) {}

  async load(): Promise<ReviewData> {
    if (getStorageInfo().storage === 'live') {
      const data = await this.google.call<GoogleReviewData>('read', {
        tabs: [
          'inspections',
          'images',
          'inspection_records',
          'record_defects',
          'gemini_results',
          'evidence_queries',
          'evidence_links',
        ],
      });
      return {
        inspections: this.inspections.fromGoogle(data),
        results: this.geminiResults.fromGoogle(data.gemini_results ?? []),
        queries: (data.evidence_queries ?? []).map((row) => ({
          ...row,
          sources: this.parseSources(row.sources),
        })),
        links: (data.evidence_links ?? []).map((row) => ({ ...row, memo: String(row.memo ?? '') })),
      };
    }

    return {
      inspections: await this.inspections.getAll(),
      results: await this.geminiResults.listAll(),
      queries: this.readLocal<EvidenceQuery>(this.queriesPath),
      links: this.readLocal<EvidenceLink>(this.linksPath),
    };
  }

  async saveQuery(record: EvidenceQuery): Promise<void> {
    if (getStorageInfo().storage === 'live') {
      await this.google.call('saveEvidenceQuery', {
        record: { ...record, sources: JSON.stringify(record.sources) },
      });
      return;
    }
    this.appendLocal(this.queriesPath, record);
  }

  async saveLink(record: EvidenceLink): Promise<void> {
    if (getStorageInfo().storage === 'live') {
      await this.google.call('saveEvidenceLink', { record });
      return;
    }
    this.appendLocal(this.linksPath, record);
  }

  latestResult(data: ReviewData, inspectionId: string): GeminiResultRecord | undefined {
    return findLatest(data.results.filter((record) => record.inspection_id === inspectionId));
  }

  latestQuery(data: ReviewData, draftId: string): EvidenceQuery | undefined {
    return findLatest(data.queries.filter((record) => record.draft_id === draftId));
  }

  latestLink(data: ReviewData, draftId: string): EvidenceLink | undefined {
    return findLatest(data.links.filter((record) => record.draft_id === draftId));
  }

  latestLinkOfQuery(data: ReviewData, queryId: string): EvidenceLink | undefined {
    return findLatest(data.links.filter((record) => record.query_id === queryId));
  }

  isReviewPending(data: ReviewData, inspection: Inspection): boolean {
    const draft = this.latestResult(data, inspection.inspection_id);
    if (!draft) return false;
    if (this.geminiResults.isStale(inspection, draft)) return true;
    const status = this.latestLink(data, draft.result_id)?.status;
    return status !== 'VERIFIED_BY_USER' && status !== 'MOCK_USER_REVIEWED';
  }

  private parseSources(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || value === '') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private readLocal<T>(filePath: string): T[] {
    if (!existsSync(filePath)) return [];
    const value: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private appendLocal<T>(filePath: string, record: T): void {
    const records = [...this.readLocal<T>(filePath), record];
    mkdirSync(this.runtimeDirectory, { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, filePath);
  }
}
