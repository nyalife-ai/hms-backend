/**
 * File: typeorm-document.repository.ts
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { DocumentsQueryDto } from '../../dto';
import { Document } from '../../domain/document.entity';
import { DocumentName } from '../../domain/value-objects/document-name.vo';
import type {
  IDocumentRepository,
  DocumentPage,
} from '../../interfaces/document-repository.interface';
import { DocumentOrmEntity } from './document.orm-entity';

@Injectable()
export class TypeOrmDocumentRepository implements IDocumentRepository {
  public constructor(
    @InjectRepository(DocumentOrmEntity)
    private readonly repo: Repository<DocumentOrmEntity>,
  ) {}

  public async save(entity: Document): Promise<Document> {
    const row = this.repo.create({
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    });
    return this.toDomain(await this.repo.save(row));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async findById(id: string): Promise<Document | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Document[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: DocumentsQueryDto): Promise<DocumentPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.repo.findAndCount({
      where: { deletedAt: IsNull() },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  private toDomain(row: DocumentOrmEntity): Document {
    return Document.reconstitute(
      row.id,
      {
        name: DocumentName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        documentType: row.description ?? 'OTHER',
        filePath: '/placeholder',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        isConfidential: false,
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
