import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import './auth.types';
import { EvidenceStore } from './evidence.store';
import type { EvidenceLink, EvidenceLinkStatus, EvidenceQuery, EvidenceStatus } from './evidence.types';
import { GeminiResultStore } from './gemini-result.store';
import type { Inspection } from './inspection.types';
import { koreanDateTime } from './korean-time';
import { NotebookLMClient } from './notebooklm.client';
import { findPrompt } from './prompts.controller';
import { getNotebookLMMode } from './storage-mode';

const productNames: Record<string, string> = {
  'P-SILVER': '텀블러 실버',
  'P-WHITE': '텀블러 화이트',
  'P-BLACK': '텀블러 블랙',
};

const linkStatuses: Record<'mock' | 'live', Record<'match' | 'review', EvidenceLinkStatus>> = {
  live: { match: 'VERIFIED_BY_USER', review: 'REVIEW_NEEDED_BY_USER' },
  mock: { match: 'MOCK_USER_REVIEWED', review: 'MOCK_REVIEW_NEEDED' },
};

@Controller('api/inspections/:inspectionId')
export class EvidenceController {
  constructor(
    private readonly evidence: EvidenceStore,
    private readonly geminiResults: GeminiResultStore,
    private readonly notebooklm: NotebookLMClient,
  ) {}

  @Get('evidence')
  async getStatus(@Param('inspectionId') inspectionId: string): Promise<EvidenceStatus> {
    const { data, inspection, draft } = await this.loadInspection(inspectionId);
    const query = draft ? this.evidence.latestQuery(data, draft.result_id) : undefined;
    const link = query ? this.evidence.latestLinkOfQuery(data, query.query_id) : undefined;
    return {
      mode: getNotebookLMMode(),
      revision: draft?.revision ?? inspection.revision,
      has_result: Boolean(draft),
      stale: Boolean(draft && this.geminiResults.isStale(inspection, draft)),
      query: query ?? null,
      link: link ?? null,
    };
  }

  @Post('evidence')
  async ask(
    @Param('inspectionId') inspectionId: string,
    @Body() body: { prompt?: unknown },
  ): Promise<EvidenceQuery> {
    const { inspection, draft } = await this.loadInspection(inspectionId);
    const mode = getNotebookLMMode();
    if (mode === 'off') {
      throw new BadRequestException(
        'NotebookLM 근거 대조가 꺼져 있습니다(NOTEBOOKLM_MODE=off). 기준 원문을 직접 읽고 판단하세요.',
      );
    }
    if (!draft) {
      throw new BadRequestException(
        '2번 탭에서 판독 결과를 먼저 준비하세요. 결과가 생기면 근거를 볼 수 있습니다.',
      );
    }
    if (this.geminiResults.isStale(inspection, draft)) {
      throw new BadRequestException(
        '2번 탭에서 다시 판독해 주세요. 이전 결과로는 근거를 확인할 수 없습니다.',
      );
    }
    const promptName = body?.prompt === undefined ? 'v3' : body.prompt;
    const prompt = typeof promptName === 'string' ? findPrompt(promptName, 'notebooklm') : undefined;
    if (!prompt) throw new BadRequestException('근거 질문 버전을 찾을 수 없습니다.');

    const question = this.buildQuestion(prompt.text, inspection, draft.revision);
    const answer =
      mode === 'mock'
        ? { text: this.mockAnswer(draft.revision), sources: [] }
        : await this.notebooklm.query(question);
    const record: EvidenceQuery = {
      query_id: `EQ-${randomBytes(4).toString('hex')}`,
      inspection_id: inspection.inspection_id,
      draft_id: draft.result_id,
      created_at: koreanDateTime(),
      mode,
      revision: draft.revision,
      prompt_name: prompt.name,
      question,
      answer: answer.text,
      sources: answer.sources,
    };
    await this.evidence.saveQuery(record);
    return record;
  }

  @Post('evidence-link')
  async saveLink(
    @Param('inspectionId') inspectionId: string,
    @Body() body: { verdict?: unknown; memo?: unknown },
    @Req() request: Request,
  ): Promise<EvidenceLink> {
    const { data, draft } = await this.loadInspection(inspectionId);
    if (body?.verdict !== 'match' && body?.verdict !== 'review') {
      throw new BadRequestException('대조 결과를 확인하세요.');
    }
    if (body.memo !== undefined && typeof body.memo !== 'string') {
      throw new BadRequestException('메모를 확인하세요.');
    }
    const query = draft ? this.evidence.latestQuery(data, draft.result_id) : undefined;
    if (!query) throw new BadRequestException('근거 확인을 먼저 하세요.');

    const record: EvidenceLink = {
      link_id: `EL-${randomBytes(4).toString('hex')}`,
      query_id: query.query_id,
      inspection_id: inspectionId,
      draft_id: query.draft_id,
      status: linkStatuses[query.mode][body.verdict],
      memo: body.memo ?? '',
      user: request.session.user?.username ?? '',
      created_at: koreanDateTime(),
    };
    await this.evidence.saveLink(record);
    return record;
  }

  private async loadInspection(inspectionId: string) {
    const data = await this.evidence.load();
    const inspection = data.inspections.find((item) => item.inspection_id === inspectionId);
    if (!inspection) throw new NotFoundException('검사를 찾을 수 없습니다.');
    return { data, inspection, draft: this.evidence.latestResult(data, inspectionId) };
  }

  private buildQuestion(promptText: string, inspection: Inspection, revision: string): string {
    const fixedText = readFileSync(
      path.join(process.cwd(), 'docs', 'guide', 'files', 'reference', 'notebooklm-fixed-text.md'),
      'utf8',
    );
    const readLine = (label: string): string => {
      const line = fixedText.split(/\r?\n/).find((item) => item.startsWith(`${label}: `));
      if (!line) throw new Error(`${label} 글을 찾을 수 없습니다.`);
      return line.slice(label.length + 2).trim();
    };
    const productName = productNames[inspection.product_id];
    const product = productName ? `${productName} (${inspection.product_id})` : '제품 미지정';
    const weight = inspection.weight_g === null ? '미측정' : `${inspection.weight_g}g`;
    return [
      readLine('안전 문구'),
      '[근거 질문]',
      promptText.trim(),
      '[검사 정보]',
      `제품: ${product} / 중량: ${weight} / 적용 검사기준 버전: ${revision}`,
      readLine('조회 줄').replace('Rev.A', revision),
    ].join('\n\n');
  }

  private mockAnswer(revision: string): string {
    const standard = readFileSync(
      path.join(process.cwd(), 'standards', `notebooklm-${revision}.md`),
      'utf8',
    );
    const section = standard.split(/^## 2\. 외관 기준\s*$/m)[1]?.trim() ?? '';
    const sentence = /^[^\n]*?다\./.exec(section)?.[0] ?? '';
    return `${revision} 표준서 원문: "${sentence}" (출하 승인 없음, 담당자 대조 확인 필요)`;
  }
}
