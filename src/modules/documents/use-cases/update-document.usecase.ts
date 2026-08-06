/**
 * File: update-document.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateDocumentDto } from '../dto';
import { DOCUMENTS_REPOSITORY } from '../constants/documents.constants';
import type { Document } from '../domain/document.entity';
import type { IDocumentRepository } from '../interfaces/document-repository.interface';

@Injectable()
export class UpdateDocumentUseCase {
  public constructor(
    @Inject(DOCUMENTS_REPOSITORY)
    private readonly repository: IDocumentRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateDocumentDto,
  ): Promise<Result<Document, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Document', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        documentType: dto.documentType,
        filePath: dto.filePath,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        isConfidential: dto.isConfidential,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
