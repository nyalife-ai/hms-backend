/**
 * File: create-document.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateDocumentDto } from '../dto';
import { Document } from '../domain/document.entity';
import { DOCUMENTS_REPOSITORY } from '../constants/documents.constants';
import type { IDocumentRepository } from '../interfaces/document-repository.interface';

@Injectable()
export class CreateDocumentUseCase {
  public constructor(
    @Inject(DOCUMENTS_REPOSITORY)
    private readonly repository: IDocumentRepository,
  ) {}

  public async execute(
    dto: CreateDocumentDto,
  ): Promise<Result<Document, string>> {
    try {
      const entity = Document.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        documentType: dto.documentType,
        filePath: dto.filePath,
        uploadedBy: dto.uploadedBy,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        isConfidential: dto.isConfidential,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
