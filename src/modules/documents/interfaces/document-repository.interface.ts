/**
 * File: document-repository.interface.ts
 * Module: documents
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Document } from '../domain/document.entity';
import type { DocumentsQueryDto } from '../dto';

export type DocumentPage = { items: Document[]; total: number };

export interface IDocumentRepository extends Repository<Document, string> {
  findMany(query: DocumentsQueryDto): Promise<DocumentPage>;
  softDelete(id: string): Promise<void>;
}
