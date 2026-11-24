export type InspectionDecision = 'OK' | 'NG' | 'HOLD' | null;

export interface InspectionDefect {
  defect_code: string;
  defect_name: string;
}

export interface Inspection {
  inspection_id: string;
  product_id: string;
  inspected_at: string;
  revision: 'Rev.A' | 'Rev.B';
  weight_g: number | null;
  memo: string;
  decision: InspectionDecision;
  content_version: number;
  images: string[];
  /** 판단 기록에서 만드는 값입니다. 저장 파일과 시트의 검사 줄에는 넣지 않습니다. */
  defects?: InspectionDefect[];
}

export interface InspectionRecord {
  record_id: string;
  inspection_id: string;
  user_id: string;
  recorded_at: string;
  decision: 'OK' | 'NG' | 'HOLD';
  weight_g: number | null;
  notes: string;
  content_version: number;
  change_reason: string;
}

export interface InspectionRecordWithDefects extends InspectionRecord {
  defects: InspectionDefect[];
}

export interface RecordDefect {
  record_id: string;
  defect_code: string;
}

export interface LocalState {
  inspections: Inspection[];
  inspection_records: InspectionRecord[];
  record_defects: RecordDefect[];
}

export const defectNames: Record<string, string> = {
  D01: '스크래치',
  D02: '찍힘',
  D03: '라벨 오류',
  D04: '뚜껑 조립 오류',
};
