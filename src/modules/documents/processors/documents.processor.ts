/**
 * File: documents.processor.ts
 * Module: documents
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DOCUMENTS_QUEUE } from '../constants/documents.constants';

@Processor(DOCUMENTS_QUEUE.NAME)
export class DocumentsProcessor {
  private readonly logger = new Logger(DocumentsProcessor.name);

  @Process(DOCUMENTS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
