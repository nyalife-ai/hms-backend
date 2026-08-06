/**
 * Diagnos domain entity — clinical.diagnoses.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { DiagnosName } from './value-objects/diagnos-name.vo';

export type DiagnosProps = {
  /** Display label (icd10 or description slice). */
  name: DiagnosName;
  /** Real DB column `description`. */
  description: string;
  consultationId: string;
  patientId: string;
  icd10Code?: string | null;
  diagnosisType: string;
  onsetDate?: Date | null;
};

export class Diagnos extends Entity<string> {
  private props: DiagnosProps;

  private constructor(
    id: string,
    props: DiagnosProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name?: string;
    description: string;
    consultationId: string;
    patientId: string;
    icd10Code?: string;
    diagnosisType?: string;
    onsetDate?: Date | string | null;
  }): Diagnos {
    const now = new Date();
    const description = input.description.trim();
    const label =
      input.name?.trim() ||
      input.icd10Code?.trim() ||
      description.slice(0, 255);
    return new Diagnos(
      randomUUID(),
      {
        name: DiagnosName.create(label || 'Diagnosis'),
        description,
        consultationId: input.consultationId,
        patientId: input.patientId,
        icd10Code: input.icd10Code ?? null,
        diagnosisType: (input.diagnosisType || 'PRIMARY').toUpperCase(),
        onsetDate: input.onsetDate ? new Date(input.onsetDate) : null,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: DiagnosProps,
    createdAt: Date,
    updatedAt: Date,
  ): Diagnos {
    return new Diagnos(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    icd10Code?: string | null;
    diagnosisType?: string;
    onsetDate?: Date | string | null;
  }): void {
    if (patch.description !== undefined) {
      this.props.description = patch.description.trim();
    }
    if (patch.icd10Code !== undefined) {
      this.props.icd10Code = patch.icd10Code;
    }
    if (patch.diagnosisType !== undefined) {
      this.props.diagnosisType = patch.diagnosisType.toUpperCase();
    }
    if (patch.onsetDate !== undefined) {
      this.props.onsetDate = patch.onsetDate
        ? new Date(patch.onsetDate)
        : null;
    }
    if (patch.name !== undefined) {
      this.props.name = DiagnosName.create(patch.name);
    } else if (patch.icd10Code || patch.description) {
      const label =
        this.props.icd10Code?.trim() ||
        this.props.description.slice(0, 255) ||
        'Diagnosis';
      this.props.name = DiagnosName.create(label);
    }
    this.touch();
  }

  public getName(): DiagnosName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getConsultationId(): string {
    return this.props.consultationId;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getIcd10Code(): string | null | undefined {
    return this.props.icd10Code;
  }
  public getDiagnosisType(): string {
    return this.props.diagnosisType;
  }
  public getOnsetDate(): Date | null | undefined {
    return this.props.onsetDate;
  }
}
