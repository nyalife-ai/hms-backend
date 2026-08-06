/**
 * InsurancePolicy domain entity — patients.insurance_policies.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { InsurancePolicyName } from './value-objects/insurance-policy-name.vo';

export type InsurancePolicyProps = {
  /** Maps to policy_number. */
  name: InsurancePolicyName;
  description?: string;
  patientId: string;
  providerId: string;
  groupNumber?: string | null;
  memberType: string;
  principalPolicyId?: string | null;
  startDate: Date;
  expiryDate: Date;
  copayAmount: number;
  isActive: boolean;
};

export class InsurancePolicy extends Entity<string> {
  private props: InsurancePolicyProps;

  private constructor(
    id: string,
    props: InsurancePolicyProps,
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
    providerId: string;
    groupNumber?: string;
    memberType?: string;
    principalPolicyId?: string;
    startDate: Date | string;
    expiryDate: Date | string;
    copayAmount?: number;
  }): InsurancePolicy {
    const now = new Date();
    const memberType = (input.memberType || 'PRINCIPAL').toUpperCase();
    return new InsurancePolicy(
      randomUUID(),
      {
        name: InsurancePolicyName.create(
          input.name.trim().slice(0, 100) || 'POLICY',
        ),
        description: input.description ?? memberType,
        patientId: input.patientId,
        providerId: input.providerId,
        groupNumber: input.groupNumber ?? null,
        memberType,
        principalPolicyId: input.principalPolicyId ?? null,
        startDate: new Date(input.startDate),
        expiryDate: new Date(input.expiryDate),
        copayAmount: input.copayAmount ?? 0,
        isActive: true,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: InsurancePolicyProps,
    createdAt: Date,
    updatedAt: Date,
  ): InsurancePolicy {
    return new InsurancePolicy(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    groupNumber?: string | null;
    memberType?: string;
    principalPolicyId?: string | null;
    startDate?: Date | string;
    expiryDate?: Date | string;
    copayAmount?: number;
    isActive?: boolean;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = InsurancePolicyName.create(
        patch.name.trim().slice(0, 100),
      );
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.groupNumber !== undefined) {
      this.props.groupNumber = patch.groupNumber;
    }
    if (patch.memberType !== undefined) {
      this.props.memberType = patch.memberType.toUpperCase();
    }
    if (patch.principalPolicyId !== undefined) {
      this.props.principalPolicyId = patch.principalPolicyId;
    }
    if (patch.startDate !== undefined) {
      this.props.startDate = new Date(patch.startDate);
    }
    if (patch.expiryDate !== undefined) {
      this.props.expiryDate = new Date(patch.expiryDate);
    }
    if (patch.copayAmount !== undefined) {
      this.props.copayAmount = patch.copayAmount;
    }
    if (patch.isActive !== undefined) this.props.isActive = patch.isActive;
    this.touch();
  }

  public getName(): InsurancePolicyName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description ?? this.props.memberType;
  }
  public getPatientId(): string {
    return this.props.patientId;
  }
  public getProviderId(): string {
    return this.props.providerId;
  }
  public getGroupNumber(): string | null | undefined {
    return this.props.groupNumber;
  }
  public getMemberType(): string {
    return this.props.memberType;
  }
  public getPrincipalPolicyId(): string | null | undefined {
    return this.props.principalPolicyId;
  }
  public getStartDate(): Date {
    return this.props.startDate;
  }
  public getExpiryDate(): Date {
    return this.props.expiryDate;
  }
  public getCopayAmount(): number {
    return this.props.copayAmount;
  }
  public getIsActive(): boolean {
    return this.props.isActive;
  }
}
