/**
 * Staff domain entity — create / reconstitute / update / getters.
 */

import { Staff } from '../domain/staff.entity';
import { StaffName } from '../domain/value-objects/staff-name.vo';

describe('Staff entity', () => {
  const baseInput = {
    name: 'Dr. Ada Lovelace',
    userId: 'user-1',
    employeeId: 'EMP-100',
    joinDate: '2024-06-01',
    departmentId: 'dept-1',
    position: 'Physician',
    specialization: 'Cardiology',
    qualification: 'MBChB',
    emergencyContactName: 'Alice',
    emergencyContactPhone: '0700111222',
    description: 'Senior consultant',
  };

  it('creates a staff profile with required fields', () => {
    const staff = Staff.create(baseInput);

    expect(staff.getId()).toBeTruthy();
    expect(staff.getName().getValue()).toBe('Dr. Ada Lovelace');
    expect(staff.getUserId()).toBe('user-1');
    expect(staff.getEmployeeId()).toBe('EMP-100');
    expect(staff.getJoinDate().toISOString()).toBe(
      new Date('2024-06-01').toISOString(),
    );
    expect(staff.getDepartmentId()).toBe('dept-1');
    expect(staff.getPosition()).toBe('Physician');
    expect(staff.getSpecialization()).toBe('Cardiology');
    expect(staff.getQualification()).toBe('MBChB');
    expect(staff.getEmergencyContactName()).toBe('Alice');
    expect(staff.getEmergencyContactPhone()).toBe('0700111222');
    expect(staff.getIsActive()).toBe(true);
    expect(staff.getDescription()).toBe('Senior consultant');
  });

  it('falls back to employeeId when name is blank', () => {
    const staff = Staff.create({
      ...baseInput,
      name: '  ',
      joinDate: new Date('2025-01-15'),
    });
    expect(staff.getName().getValue()).toBe('EMP-100');
  });

  it('rejects missing userId, employeeId, and joinDate', () => {
    expect(() =>
      Staff.create({ employeeId: 'E1', joinDate: '2024-01-01' } as never),
    ).toThrow(/userId is required/);
    expect(() =>
      Staff.create({ userId: 'u1', joinDate: '2024-01-01' } as never),
    ).toThrow(/employeeId is required/);
    expect(() =>
      Staff.create({ userId: 'u1', employeeId: 'E1' } as never),
    ).toThrow(/joinDate is required/);
    expect(() =>
      Staff.create({
        userId: 'u1',
        employeeId: 'E1',
        joinDate: 'not-a-date',
      }),
    ).toThrow(/valid date/);
  });

  it('reconstitutes and updates patch fields', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const updatedAt = new Date('2024-01-02T00:00:00Z');
    const staff = Staff.reconstitute(
      'staff-1',
      {
        name: StaffName.create('Original'),
        userId: 'user-1',
        employeeId: 'EMP-1',
        joinDate: new Date('2023-01-01'),
        departmentId: null,
        position: null,
        specialization: null,
        qualification: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        isActive: true,
        description: undefined,
      },
      createdAt,
      updatedAt,
    );

    expect(staff.getId()).toBe('staff-1');

    staff.update({
      name: 'Updated Name',
      description: 'note',
      departmentId: 'd2',
      position: 'Lead',
      specialization: 'Oncology',
      qualification: 'MD',
      emergencyContactName: 'Bob',
      emergencyContactPhone: '0711',
      isActive: false,
      joinDate: '2025-03-01',
    });

    expect(staff.getName().getValue()).toBe('Updated Name');
    expect(staff.getDescription()).toBe('note');
    expect(staff.getDepartmentId()).toBe('d2');
    expect(staff.getPosition()).toBe('Lead');
    expect(staff.getSpecialization()).toBe('Oncology');
    expect(staff.getQualification()).toBe('MD');
    expect(staff.getEmergencyContactName()).toBe('Bob');
    expect(staff.getEmergencyContactPhone()).toBe('0711');
    expect(staff.getIsActive()).toBe(false);
    expect(staff.getJoinDate().toISOString()).toBe(
      new Date('2025-03-01').toISOString(),
    );
  });

  it('update rejects invalid joinDate', () => {
    const staff = Staff.create(baseInput);
    expect(() => staff.update({ joinDate: 'bad' })).toThrow(/valid date/);
    staff.update({ joinDate: new Date('2026-08-01') });
    expect(staff.getJoinDate().getFullYear()).toBe(2026);
  });
});
