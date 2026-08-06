/**
 * File: find-document-by-id.usecase.ts
 * Module: documents
 * Purpose: Find document by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DOCUMENTS_REPOSITORY } from '../constants/documents.constants';
import type { Document } from '../domain/document.entity';
import type { IDocumentRepository } from '../interfaces/document-repository.interface';

@Injectable()
export class FindDocumentByIdUseCase {
  public constructor(
    @Inject(DOCUMENTS_REPOSITORY) private readonly repository: IDocumentRepository,
  ) {}

  public async execute(id: string): Promise<Result<Document, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Document', id));
    }
    return Result.success(entity);
  }
}
