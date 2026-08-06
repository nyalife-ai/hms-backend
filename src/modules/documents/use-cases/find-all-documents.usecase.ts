/**
 * File: find-all-documents.usecase.ts
 * Module: documents
 * Purpose: Paginated list of documents.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { DocumentsQueryDto } from '../dto';
import { DOCUMENTS_REPOSITORY } from '../constants/documents.constants';
import type { IDocumentRepository, DocumentPage } from '../interfaces/document-repository.interface';

@Injectable()
export class FindAllDocumentsUseCase {
  public constructor(
    @Inject(DOCUMENTS_REPOSITORY) private readonly repository: IDocumentRepository,
  ) {}

  public async execute(query: DocumentsQueryDto): Promise<Result<DocumentPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
