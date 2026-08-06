/**
 * Prisma document repository — patients.documents (prisma.documents).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { DocumentsQueryDto } from '../../dto';
import { Document } from '../../domain/document.entity';
import { DocumentName } from '../../domain/value-objects/document-name.vo';
import type {
  IDocumentRepository,
  DocumentPage,
} from '../../interfaces/document-repository.interface';

@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Document): Promise<Document> {
    const existing = await this.prisma.documents.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.documents.update({
        where: { id: entity.getId() },
        data: {
          file_name: entity.getName().getValue(),
          document_type: entity.getDocumentType(),
          file_path: entity.getFilePath(),
          mime_type: entity.getMimeType() ?? null,
          file_size:
            entity.getFileSize() != null ? BigInt(entity.getFileSize()!) : null,
          is_confidential: entity.getIsConfidential(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.documents.create({
      data: {
        patient_id: entity.getPatientId(),
        document_type: entity.getDocumentType(),
        file_name: entity.getName().getValue(),
        file_path: entity.getFilePath(),
        uploaded_by: entity.getUploadedBy(),
        mime_type: entity.getMimeType() ?? null,
        file_size:
          entity.getFileSize() != null ? BigInt(entity.getFileSize()!) : null,
        is_confidential: entity.getIsConfidential(),
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.documents.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Document[]> {
    const rows = await this.prisma.documents.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.documents.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(query: DocumentsQueryDto): Promise<DocumentPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              {
                file_name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                document_type: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.documents.count({ where }),
      this.prisma.documents.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.documents.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    document_type: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    file_size: bigint | null;
    is_confidential: boolean;
    uploaded_by: string;
    created_at: Date;
    deleted_at: Date | null;
  }): Document {
    return Document.reconstitute(
      row.id,
      {
        name: DocumentName.create(row.file_name),
        description: row.document_type,
        patientId: row.patient_id,
        documentType: row.document_type,
        filePath: row.file_path,
        uploadedBy: row.uploaded_by,
        mimeType: row.mime_type,
        fileSize: row.file_size != null ? Number(row.file_size) : null,
        isConfidential: row.is_confidential,
        deletedAt: row.deleted_at,
      },
      row.created_at,
      row.created_at,
    );
  }
}
