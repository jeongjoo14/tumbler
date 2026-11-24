import type { NotebookLMMode } from './storage-mode';

export interface EvidenceQuery {
  query_id: string;
  inspection_id: string;
  draft_id: string;
  created_at: string;
  mode: 'mock' | 'live';
  revision: 'Rev.A' | 'Rev.B';
  prompt_name: string;
  question: string;
  answer: string;
  sources: unknown[];
}

export type EvidenceLinkStatus =
  | 'VERIFIED_BY_USER'
  | 'REVIEW_NEEDED_BY_USER'
  | 'MOCK_USER_REVIEWED'
  | 'MOCK_REVIEW_NEEDED';

export interface EvidenceLink {
  link_id: string;
  query_id: string;
  inspection_id: string;
  draft_id: string;
  status: EvidenceLinkStatus;
  memo: string;
  user: string;
  created_at: string;
}

export interface EvidenceStatus {
  mode: NotebookLMMode;
  revision: 'Rev.A' | 'Rev.B';
  has_result: boolean;
  stale: boolean;
  query: EvidenceQuery | null;
  link: EvidenceLink | null;
}
