export type StorageMode = 'mock' | 'live';

export interface StorageInfo {
  storage: StorageMode;
  label: string;
}

export type GeminiMode = 'off' | 'mock' | 'live';

export interface OperationsInfo extends StorageInfo {
  gemini_mode: GeminiMode;
  gemini_label: string;
}

export function getStorageInfo(): StorageInfo {
  if (process.env.STORAGE_MODE === 'live') {
    return { storage: 'live', label: 'Google 시트·드라이브(live)' };
  }

  return { storage: 'mock', label: '내 컴퓨터(mock)' };
}

export function getGeminiInfo(): Pick<OperationsInfo, 'gemini_mode' | 'gemini_label'> {
  const storage = getStorageInfo().storage;
  const configuredMode = process.env.GEMINI_MODE;
  const mode: GeminiMode = configuredMode
    ? (configuredMode as GeminiMode)
    : storage === 'live'
      ? 'live'
      : 'off';
  const labels: Record<GeminiMode, string> = {
    off: '꺼짐(off)',
    mock: '연습용(mock)',
    live: '실제 Gemini(live)',
  };

  return { gemini_mode: mode, gemini_label: labels[mode] };
}

export function validateGeminiMode(): void {
  const storage = getStorageInfo().storage;
  const mode = process.env.GEMINI_MODE;
  const resolvedMode = mode || (storage === 'live' ? 'live' : 'off');
  const validModes = ['off', 'mock', 'live'];
  const compatible =
    resolvedMode === 'off' ||
    (storage === 'mock' && resolvedMode === 'mock') ||
    (storage === 'live' && resolvedMode === 'live');

  if (!validModes.includes(resolvedMode) || !compatible) {
    throw new Error(
      'GEMINI_MODE 설정을 확인하세요. STORAGE_MODE=mock에는 off 또는 mock, STORAGE_MODE=live에는 off 또는 live를 사용할 수 있습니다.',
    );
  }
}

export type NotebookLMMode = 'off' | 'mock' | 'live';

export function getNotebookLMMode(): NotebookLMMode {
  const configuredMode = process.env.NOTEBOOKLM_MODE;
  if (configuredMode) return configuredMode as NotebookLMMode;
  return getStorageInfo().storage === 'live' ? 'off' : 'mock';
}

export function validateNotebookLMMode(): void {
  const mode = getNotebookLMMode();
  if (!['off', 'mock', 'live'].includes(mode)) {
    throw new Error('.env의 NOTEBOOKLM_MODE를 off, mock, live 가운데 하나로 고쳐 주세요.');
  }
  if (getStorageInfo().storage === 'live' && mode === 'mock') {
    throw new Error(
      'STORAGE_MODE=live에서는 NOTEBOOKLM_MODE=mock을 쓸 수 없습니다. .env의 NOTEBOOKLM_MODE를 off 또는 live로 고쳐 주세요.',
    );
  }
}

export function getLinkStatusLine(): string {
  const storage = getStorageInfo().storage;
  const gemini = getGeminiInfo().gemini_mode;
  const notebooklm = getNotebookLMMode();
  const storageText: Record<StorageMode, string> = { mock: '로컬 파일', live: 'GAS 웹앱' };
  const geminiText: Record<GeminiMode, string> = {
    off: '사람이 직접 판정',
    mock: '모의 초안',
    live: 'GAS에서 OnePort로 Gemini 호출',
  };
  const notebooklmText: Record<NotebookLMMode, string> = {
    off: '근거 대조 꺼짐',
    mock: '모의 응답',
    live: '실제 질의',
  };
  return `연동 상태: 저장소=${storage}(${storageText[storage]}) · Gemini=${gemini}(${geminiText[gemini]}) · NotebookLM=${notebooklm}(${notebooklmText[notebooklm]})`;
}

export function getOperationsInfo(): OperationsInfo {
  return { ...getStorageInfo(), ...getGeminiInfo() };
}
