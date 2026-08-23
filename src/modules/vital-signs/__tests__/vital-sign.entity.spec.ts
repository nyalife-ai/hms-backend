/**
 * VitalSign domain entity — create / reconstitute / update / getters.
 */

import { VitalSign } from '../domain/vital-sign.entity';

describe('VitalSign entity', () => {
  it('creates with defaults and derives label from blood pressure', () => {
    const vs = VitalSign.create({
      patientId: 'pat-1',
      recordedBy: 'nurse-1',
      bloodPressure: '120/80',
      heartRate: 72,
      notes: 'resting',
    });

    expect(vs.getId()).toBeTruthy();
    expect(vs.getName().getValue()).toBe('120/80');
    expect(vs.getPatientId()).toBe('pat-1');
    expect(vs.getRecordedBy()).toBe('nurse-1');
    expect(vs.getBloodPressure()).toBe('120/80');
    expect(vs.getHeartRate()).toBe(72);
    expect(vs.getNotes()).toBe('resting');
    expect(vs.getDescription()).toBe('resting');
    expect(vs.getUrgencyLevel()).toBe('NORMAL');
    expect(vs.getIsVoided()).toBe(false);
    expect(vs.getMeasuredAt()).toBeInstanceOf(Date);
    expect(vs.getConsultationId()).toBeNull();
  });

  it('creates EMERGENCY urgency and uses explicit name over BP', () => {
    const measured = new Date('2026-01-15T10:00:00Z');
    const vs = VitalSign.create({
      name: '  Full vitals  ',
      patientId: 'pat-2',
      recordedBy: 'nurse-2',
      consultationId: 'c1',
      bloodPressure: '90/60',
      respiratoryRate: 22,
      temperature: 38.5,
      weight: 70,
      height: 170,
      bmi: 24.2,
      painLevel: 4,
      oxygenSaturation: 96,
      urgencyLevel: 'EMERGENCY',
      measuredAt: measured,
      description: 'fever',
    });

    expect(vs.getName().getValue()).toBe('Full vitals');
    expect(vs.getConsultationId()).toBe('c1');
    expect(vs.getRespiratoryRate()).toBe(22);
    expect(vs.getTemperature()).toBe(38.5);
    expect(vs.getWeight()).toBe(70);
    expect(vs.getHeight()).toBe(170);
    expect(vs.getBmi()).toBe(24.2);
    expect(vs.getPainLevel()).toBe(4);
    expect(vs.getOxygenSaturation()).toBe(96);
    expect(vs.getUrgencyLevel()).toBe('EMERGENCY');
    expect(vs.getMeasuredAt()?.toISOString()).toBe(measured.toISOString());
    expect(vs.getDescription()).toBe('fever');
  });

  it('falls back to Vitals label when name and BP are empty', () => {
    const vs = VitalSign.create({
      patientId: 'pat-3',
      recordedBy: 'nurse-3',
      name: '   ',
      bloodPressure: '',
    });
    expect(vs.getName().getValue()).toBe('Vitals');
  });

  it('reconstitutes and updates clinical fields', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const updatedAt = new Date('2026-01-02T00:00:00Z');
    const vs = VitalSign.reconstitute(
      'vs-1',
      {
        name: VitalSign.create({
          patientId: 'p',
          recordedBy: 'r',
          name: 'Seed',
        }).getName(),
        patientId: 'pat-1',
        recordedBy: 'nurse-1',
        consultationId: null,
        bloodPressure: '110/70',
        heartRate: 60,
        respiratoryRate: null,
        temperature: null,
        weight: null,
        height: null,
        bmi: null,
        painLevel: null,
        oxygenSaturation: null,
        notes: null,
        urgencyLevel: 'NORMAL',
        measuredAt: createdAt,
        isVoided: false,
      },
      createdAt,
      updatedAt,
    );

    expect(vs.getId()).toBe('vs-1');
    expect(vs.getCreatedAt().toISOString()).toBe(createdAt.toISOString());

    vs.update({
      bloodPressure: '118/76',
      heartRate: 68,
      respiratoryRate: 16,
      temperature: 36.8,
      weight: 68,
      height: 168,
      bmi: 24.1,
      painLevel: 1,
      oxygenSaturation: 98,
      notes: 'stable',
      urgencyLevel: 'EMERGENCY',
      description: 'post-triage',
      measuredAt: '2026-02-01T12:00:00Z',
      consultationId: 'consult-9',
      name: 'Updated vitals',
    });

    expect(vs.getName().getValue()).toBe('Updated vitals');
    expect(vs.getBloodPressure()).toBe('118/76');
    expect(vs.getHeartRate()).toBe(68);
    expect(vs.getRespiratoryRate()).toBe(16);
    expect(vs.getTemperature()).toBe(36.8);
    expect(vs.getWeight()).toBe(68);
    expect(vs.getHeight()).toBe(168);
    expect(vs.getBmi()).toBe(24.1);
    expect(vs.getPainLevel()).toBe(1);
    expect(vs.getOxygenSaturation()).toBe(98);
    expect(vs.getNotes()).toBe('post-triage');
    expect(vs.getDescription()).toBe('post-triage');
    expect(vs.getUrgencyLevel()).toBe('EMERGENCY');
    expect(vs.getConsultationId()).toBe('consult-9');
    expect(vs.getMeasuredAt()?.toISOString()).toBe(
      new Date('2026-02-01T12:00:00Z').toISOString(),
    );
    expect(vs.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(
      updatedAt.getTime(),
    );
  });

  it('update derives name from blood pressure and clears measuredAt', () => {
    const vs = VitalSign.create({
      patientId: 'pat-4',
      recordedBy: 'nurse-4',
      name: 'Initial',
    });

    vs.update({
      bloodPressure: '130/85',
      urgencyLevel: 'NORMAL',
      measuredAt: null,
    });

    expect(vs.getName().getValue()).toBe('130/85');
    expect(vs.getUrgencyLevel()).toBe('NORMAL');
    expect(vs.getMeasuredAt()).toBeNull();
  });
});
