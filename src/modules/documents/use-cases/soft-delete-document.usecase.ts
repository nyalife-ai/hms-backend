/**
 * File: soft-delete-document.usecase.ts
 * Module: documents
 * Purpose: Soft-delete document.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DOCUMENTS_REPOSITORY } from '../constants/documents.constants';
import type { IDocumentRepository } from '../interfaces/document-repository.interface';

@Injectable()
export class SoftDeleteDocumentUseCase {
  public constructor(
    @Inject(DOCUMENTS_REPOSITORY) private readonly repository: IDocumentRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Document', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
