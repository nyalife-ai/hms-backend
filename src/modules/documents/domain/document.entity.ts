/**
 * Document domain entity — patients.documents.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { DocumentName } from './value-objects/document-name.vo';

export type DocumentProps = {
  /** Maps to file_name. */
  name: DocumentName;
  /** Maps to document_type (or free-text note). */
  description?: string;
  patientId: string;
  documentType: string;
  filePath: string;
  uploadedBy: string;
  mimeType?: string | null;
  fileSize?: number | null;
  isConfidential: boolean;
  deletedAt?: Date | null;
};

export class Document extends Entity<string> {
  private props: DocumentProps;

  private constructor(
    id: string,
    props: DocumentProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name: string;
    description?: string;
    patientId: string;
    documentType?: string;
    filePath: string;
    uploadedBy: string;
    mimeType?: string;
    fileSize?: number;
    isConfidential?: boolean;
  }): Document {
    const now = new Date();
    const documentType =
      input.documentType?.trim() ||
      input.description?.trim() ||
      'OTHER';
    return new Document(
      randomUUID(),
      {
        name: DocumentName.create(input.name.trim().slice(0, 255) || 'document'),
        description: input.description ?? documentType,
        patientId: input.patientId,
        documentType: documentType.slice(0, 50),
        filePath: input.filePath,
        uploadedBy: input.uploadedBy,
        mimeType: input.mimeType ?? null,
        fileSize: input.fileSize ?? null,
        isConfidential: input.isConfidential ?? false,
        deletedAt: null,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: DocumentProps,
    createdAt: Date,
    updatedAt: Date,
  ): Document {
    return new Document(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    documentType?: string;
    filePath?: string;
    mimeType?: string | null;
    fileSize?: number | null;
    isConfidential?: boolean;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = DocumentName.create(patch.name.trim().slice(0, 255));
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.documentType !== undefined) {
      this.props.documentType = patch.documentType.slice(0, 50);
    } else if (patch.description !== undefined) {
      this.props.documentType = patch.description.slice(0, 50);
    }
    if (patch.filePath !== undefined) this.props.filePath = patch.filePath;
    if (patch.mimeType !== undefined) this.props.mimeType = patch.mimeType;
    if (patch.fileSize !== undefined) this.props.fileSize = patch.fileSize;
    if (patch.isConfidential !== undefined) {
      this.props.isConfidential = patch.isConfidential;
    }
    this.touch();
  }

  public getName(): DocumentName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description ?? this.props.documentType;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getDocumentType(): string {
    return this.props.documentType;
  }
  public getFilePath(): string {
    return this.props.filePath;
  }
  public getUploadedBy(): string {
    return this.props.uploadedBy;
  }
  public getMimeType(): string | null | undefined {
    return this.props.mimeType;
  }
  public getFileSize(): number | null | undefined {
    return this.props.fileSize;
  }
  public getIsConfidential(): boolean {
    return this.props.isConfidential;
  }
  public getDeletedAt(): Date | null | undefined {
    return this.props.deletedAt;
  }
}
