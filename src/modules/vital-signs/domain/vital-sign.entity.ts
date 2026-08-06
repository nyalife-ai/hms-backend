/**
 * VitalSign domain entity — clinical.vital_signs.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { VitalSignName } from './value-objects/vital-sign-name.vo';

export type VitalSignProps = {
  /** Display label (blood pressure or “Vitals”). */
  name: VitalSignName;
  description?: string;
  patientId: string;
  recordedBy: string;
  consultationId?: string | null;
  bloodPressure?: string | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  painLevel?: number | null;
  oxygenSaturation?: number | null;
  notes?: string | null;
  measuredAt?: Date | null;
  isVoided: boolean;
};

export class VitalSign extends Entity<string> {
  private props: VitalSignProps;

  private constructor(
    id: string,
    props: VitalSignProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name?: string;
    description?: string;
    patientId: string;
    recordedBy: string;
    consultationId?: string;
    bloodPressure?: string;
    heartRate?: number;
    respiratoryRate?: number;
    temperature?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    painLevel?: number;
    oxygenSaturation?: number;
    notes?: string;
    measuredAt?: Date | string | null;
  }): VitalSign {
    const now = new Date();
    const label =
      input.name?.trim() ||
      input.bloodPressure?.trim() ||
      'Vitals';
    return new VitalSign(
      randomUUID(),
      {
        name: VitalSignName.create(label.slice(0, 255) || 'Vitals'),
        description: input.description ?? input.notes,
        patientId: input.patientId,
        recordedBy: input.recordedBy,
        consultationId: input.consultationId ?? null,
        bloodPressure: input.bloodPressure ?? null,
        heartRate: input.heartRate ?? null,
        respiratoryRate: input.respiratoryRate ?? null,
        temperature: input.temperature ?? null,
        weight: input.weight ?? null,
        height: input.height ?? null,
        bmi: input.bmi ?? null,
        painLevel: input.painLevel ?? null,
        oxygenSaturation: input.oxygenSaturation ?? null,
        notes: input.notes ?? input.description ?? null,
        measuredAt: input.measuredAt ? new Date(input.measuredAt) : now,
        isVoided: false,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: VitalSignProps,
    createdAt: Date,
    updatedAt: Date,
  ): VitalSign {
    return new VitalSign(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    bloodPressure?: string | null;
    heartRate?: number | null;
    respiratoryRate?: number | null;
    temperature?: number | null;
    weight?: number | null;
    height?: number | null;
    bmi?: number | null;
    painLevel?: number | null;
    oxygenSaturation?: number | null;
    notes?: string | null;
    measuredAt?: Date | string | null;
    consultationId?: string | null;
  }): void {
    if (patch.bloodPressure !== undefined) {
      this.props.bloodPressure = patch.bloodPressure;
    }
    if (patch.heartRate !== undefined) this.props.heartRate = patch.heartRate;
    if (patch.respiratoryRate !== undefined) {
      this.props.respiratoryRate = patch.respiratoryRate;
    }
    if (patch.temperature !== undefined) {
      this.props.temperature = patch.temperature;
    }
    if (patch.weight !== undefined) this.props.weight = patch.weight;
    if (patch.height !== undefined) this.props.height = patch.height;
    if (patch.bmi !== undefined) this.props.bmi = patch.bmi;
    if (patch.painLevel !== undefined) this.props.painLevel = patch.painLevel;
    if (patch.oxygenSaturation !== undefined) {
      this.props.oxygenSaturation = patch.oxygenSaturation;
    }
    if (patch.notes !== undefined) this.props.notes = patch.notes;
    if (patch.description !== undefined) {
      this.props.description = patch.description;
      this.props.notes = patch.description;
    }
    if (patch.measuredAt !== undefined) {
      this.props.measuredAt = patch.measuredAt
        ? new Date(patch.measuredAt)
        : null;
    }
    if (patch.consultationId !== undefined) {
      this.props.consultationId = patch.consultationId;
    }
    if (patch.name !== undefined) {
      this.props.name = VitalSignName.create(patch.name);
    } else if (patch.bloodPressure) {
      this.props.name = VitalSignName.create(
        patch.bloodPressure.slice(0, 255) || 'Vitals',
      );
    }
    this.touch();
  }

  public getName(): VitalSignName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description ?? this.props.notes ?? undefined;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getRecordedBy(): string {
    return this.props.recordedBy;
  }
  public getConsultationId(): string | null | undefined {
    return this.props.consultationId;
  }
  public getBloodPressure(): string | null | undefined {
    return this.props.bloodPressure;
  }
  public getHeartRate(): number | null | undefined {
    return this.props.heartRate;
  }
  public getRespiratoryRate(): number | null | undefined {
    return this.props.respiratoryRate;
  }
  public getTemperature(): number | null | undefined {
    return this.props.temperature;
  }
  public getWeight(): number | null | undefined {
    return this.props.weight;
  }
  public getHeight(): number | null | undefined {
    return this.props.height;
  }
  public getBmi(): number | null | undefined {
    return this.props.bmi;
  }
  public getPainLevel(): number | null | undefined {
    return this.props.painLevel;
  }
  public getOxygenSaturation(): number | null | undefined {
    return this.props.oxygenSaturation;
  }
  public getNotes(): string | null | undefined {
    return this.props.notes;
  }
  public getMeasuredAt(): Date | null | undefined {
    return this.props.measuredAt;
  }
  public getIsVoided(): boolean {
    return this.props.isVoided;
  }
}
