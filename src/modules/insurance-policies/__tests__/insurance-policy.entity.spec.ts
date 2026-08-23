/**
 * InsurancePolicy domain entity — create / reconstitute / update / getters.
 */

import { InsurancePolicy } from '../domain/insurance-policy.entity';
import { InsurancePolicyName } from '../domain/value-objects/insurance-policy-name.vo';

describe('InsurancePolicy entity', () => {
  it('creates with defaults and uppercases member type', () => {
    const policy = InsurancePolicy.create({
      name: '  POL-100  ',
      patientId: 'pat1',
      providerId: 'prov1',
      startDate: '2026-01-01',
      expiryDate: '2026-12-31',
      memberType: 'dependent',
      groupNumber: 'G9',
      principalPolicyId: 'principal-1',
      copayAmount: 250,
      description: 'family cover',
    });

    expect(policy.getId()).toBeTruthy();
    expect(policy.getName().getValue()).toBe('POL-100');
    expect(policy.getPatientId()).toBe('pat1');
    expect(policy.getProviderId()).toBe('prov1');
    expect(policy.getMemberType()).toBe('DEPENDENT');
    expect(policy.getGroupNumber()).toBe('G9');
    expect(policy.getPrincipalPolicyId()).toBe('principal-1');
    expect(policy.getCopayAmount()).toBe(250);
    expect(policy.getIsActive()).toBe(true);
    expect(policy.getDescription()).toBe('family cover');
    expect(policy.getStartDate()).toBeInstanceOf(Date);
    expect(policy.getExpiryDate()).toBeInstanceOf(Date);
  });

  it('defaults member type and empty name fallback', () => {
    const policy = InsurancePolicy.create({
      name: '   ',
      patientId: 'pat2',
      providerId: 'prov2',
      startDate: new Date('2026-02-01'),
      expiryDate: new Date('2027-02-01'),
    });
    expect(policy.getName().getValue()).toBe('POLICY');
    expect(policy.getMemberType()).toBe('PRINCIPAL');
    expect(policy.getCopayAmount()).toBe(0);
    expect(policy.getGroupNumber()).toBeNull();
    expect(policy.getPrincipalPolicyId()).toBeNull();
    expect(policy.getDescription()).toBe('PRINCIPAL');
  });

  it('reconstitutes and updates all patch fields', () => {
    const createdAt = new Date('2026-01-01');
    const updatedAt = new Date('2026-01-02');
    const policy = InsurancePolicy.reconstitute(
      'pol-1',
      {
        name: InsurancePolicyName.create('OLD'),
        description: 'old',
        patientId: 'pat1',
        providerId: 'prov1',
        groupNumber: 'G1',
        memberType: 'PRINCIPAL',
        principalPolicyId: null,
        startDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-06-01'),
        copayAmount: 100,
        isActive: true,
      },
      createdAt,
      updatedAt,
    );

    policy.update({
      name: '  NEW-POL  ',
      description: 'updated',
      groupNumber: null,
      memberType: 'spouse',
      principalPolicyId: 'p-main',
      startDate: '2026-03-01',
      expiryDate: '2027-03-01',
      copayAmount: 400,
      isActive: false,
    });

    expect(policy.getName().getValue()).toBe('NEW-POL');
    expect(policy.getDescription()).toBe('updated');
    expect(policy.getGroupNumber()).toBeNull();
    expect(policy.getMemberType()).toBe('SPOUSE');
    expect(policy.getPrincipalPolicyId()).toBe('p-main');
    expect(policy.getCopayAmount()).toBe(400);
    expect(policy.getIsActive()).toBe(false);
    expect(policy.getStartDate().toISOString()).toContain('2026-03-01');
    expect(policy.getExpiryDate().toISOString()).toContain('2027-03-01');
    expect(policy.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(
      updatedAt.getTime(),
    );
  });

  it('update no-ops when patch empty still touches', () => {
    const policy = InsurancePolicy.create({
      name: 'P1',
      patientId: 'pat1',
      providerId: 'prov1',
      startDate: '2026-01-01',
      expiryDate: '2026-12-31',
    });
    const before = policy.getUpdatedAt().getTime();
    policy.update({});
    expect(policy.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(before);
  });
});
