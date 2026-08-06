/**
 * File: documents.service.spec.ts
 * Module: documents
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentsService } from '../documents.service';
import { CreateDocumentUseCase } from '../use-cases/create-document.usecase';
import { FindDocumentByIdUseCase } from '../use-cases/find-document-by-id.usecase';
import { FindAllDocumentsUseCase } from '../use-cases/find-all-documents.usecase';
import { UpdateDocumentUseCase } from '../use-cases/update-document.usecase';
import { SoftDeleteDocumentUseCase } from '../use-cases/soft-delete-document.usecase';
import { Result } from '../../../core/contracts';

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: CreateDocumentUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindDocumentByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllDocumentsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns paginated payload', async () => {
    const res = await service.findAll({ page: 1, limit: 10 });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});
