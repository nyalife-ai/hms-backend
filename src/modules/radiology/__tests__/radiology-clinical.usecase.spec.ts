/**
 * RadiologyClinicalUseCase — scan types, requests, findings, reports, images.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RadiologyClinicalUseCase } from '../use-cases/radiology-clinical.usecase';

const REQ = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SCAN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RAD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQ,
    request_number: 'RAD-001',
    status: 'PENDING',
    priority: 'ROUTINE',
    clinical_indication: 'Chest pain',
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    patient: {
      patient_number: 'MRN-1',
      user: {
        core_profiles_user_id: [{ first_name: 'Amina', last_name: 'Wanjiru' }],
      },
    },
    requesting_doctor: {
      user: {
        core_profiles_user_id: [{ first_name: 'John', last_name: 'Doe' }],
      },
    },
    scan_type: { scan_type: 'Chest X-Ray' },
    ...overrides,
  };
}

describe('RadiologyClinicalUseCase', () => {
  let prisma: any;
  let events: { emit: jest.Mock };
  let uc: RadiologyClinicalUseCase;

  beforeEach(() => {
    prisma = {
      scanTypes: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      radiologyRequests: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
      findings: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      reports: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      images: { create: jest.fn() },
    };
    events = { emit: jest.fn() };
    uc = new RadiologyClinicalUseCase(prisma, events as any);
  });

  it('listScanTypes filters by active and search', async () => {
    prisma.scanTypes.findMany.mockResolvedValue([
      {
        id: SCAN,
        scan_type: 'CT Head',
        category: 'CT',
        description: null,
        standard_price: { toNumber: () => 5000 },
        typical_duration_minutes: 30,
        contrast_required: true,
        is_active: true,
      },
    ]);
    const rows = await uc.listScanTypes({ active: true, search: 'CT' });
    expect(rows[0]).toEqual(
      expect.objectContaining({
        scanType: 'CT Head',
        standardPrice: 5000,
        contrastRequired: true,
      }),
    );
    expect(prisma.scanTypes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ is_active: true }),
      }),
    );
  });

  it('createScanType / updateScanType validate and map numeric price', async () => {
    await expect(uc.createScanType({ scanType: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.scanTypes.create.mockResolvedValue({
      id: SCAN,
      scan_type: 'MRI',
      category: 'MRI',
      description: 'Brain',
      standard_price: 12000,
      typical_duration_minutes: 45,
      contrast_required: false,
      is_active: true,
    });
    const created = await uc.createScanType({
      scanType: ' MRI ',
      category: ' MRI ',
      description: ' Brain ',
      standardPrice: 12000,
      typicalDurationMinutes: 45,
    });
    expect(created.scanType).toBe('MRI');

    prisma.scanTypes.findFirst.mockResolvedValue(null);
    await expect(uc.updateScanType(SCAN, { scanType: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.scanTypes.findFirst.mockResolvedValue({ id: SCAN });
    prisma.scanTypes.update.mockResolvedValue({
      id: SCAN,
      scan_type: 'MRI Spine',
      category: null,
      description: null,
      standard_price: 15000,
      typical_duration_minutes: 60,
      contrast_required: true,
      is_active: false,
    });
    const updated = await uc.updateScanType(SCAN, {
      scanType: 'MRI Spine',
      category: '  ',
      description: '  ',
      standardPrice: 15000,
      typicalDurationMinutes: 60,
      contrastRequired: true,
      isActive: false,
    });
    expect(updated.isActive).toBe(false);
  });

  it('listRequests paginates and getRequest maps detail relations', async () => {
    prisma.radiologyRequests.findMany.mockResolvedValue([requestRow()]);
    prisma.radiologyRequests.count.mockResolvedValue(1);
    const page = await uc.listRequests({
      status: 'pending',
      patientId: 'p1',
      search: 'RAD',
      take: 10,
      skip: 0,
    });
    expect(page.total).toBe(1);
    expect(page.items[0].patientName).toBe('Amina Wanjiru');
    expect(page.items[0].requestedBy).toBe('John Doe');

    prisma.radiologyRequests.findFirst.mockResolvedValue(null);
    await expect(uc.getRequest(REQ)).rejects.toBeInstanceOf(NotFoundException);

    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...requestRow({
        requesting_doctor: null,
        patient: {
          patient_number: 'MRN-2',
          user: { core_profiles_user_id: [] },
        },
      }),
      radiology_findings_request_id: {
        id: 'f1',
        findings_text: 'Normal',
        status: 'FINAL',
      },
      radiology_reports_request_id: {
        id: 'r1',
        final_impression: 'Clear',
        conclusion: 'Ok',
        recommendations: null,
        signed_at: new Date('2026-08-02T00:00:00.000Z'),
      },
      radiology_images_request_id: [
        {
          id: 'i1',
          file_path: '/x.dcm',
          modality: 'XR',
          series_description: 'PA',
          number_of_images: 2,
          created_at: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });
    const detail = await uc.getRequest(REQ);
    expect(detail.patientName).toBe('MRN-2');
    expect(detail.requestedBy).toBe('Clinical team');
    expect(detail.findings?.status).toBe('FINAL');
    expect(detail.report?.signedAt).toContain('2026-08-02');
    expect(detail.images).toHaveLength(1);

    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...requestRow(),
      radiology_findings_request_id: [
        { id: 'f1', findings_text: null, status: 'DRAFT' },
      ],
      radiology_reports_request_id: [],
      radiology_images_request_id: null,
    });
    const detail2 = await uc.getRequest(REQ);
    expect(detail2.report).toBeNull();
    expect(detail2.images).toEqual([]);
  });

  it('upsertFindings creates or updates', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...requestRow(),
      radiology_findings_request_id: null,
      radiology_reports_request_id: null,
      radiology_images_request_id: [],
    });
    prisma.findings.findFirst.mockResolvedValue(null);
    prisma.findings.create.mockResolvedValue({ id: 'f1', status: 'DRAFT' });
    await uc.upsertFindings(REQ, { radiologistId: RAD, findingsText: 'ok' });
    expect(prisma.findings.create).toHaveBeenCalled();

    prisma.findings.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.findings.update.mockResolvedValue({ id: 'f1', status: 'FINAL' });
    await uc.upsertFindings(REQ, {
      radiologistId: RAD,
      status: 'final',
    });
    expect(prisma.findings.update).toHaveBeenCalled();
  });

  it('upsertReport creates findings/report and emits on signature', async () => {
    prisma.findings.findFirst.mockResolvedValueOnce(null);
    prisma.findings.create.mockResolvedValue({ id: 'f1' });
    prisma.reports.findFirst.mockResolvedValue(null);
    prisma.reports.create.mockResolvedValue({ id: 'r1' });
    prisma.radiologyRequests.update.mockResolvedValue({});
    prisma.radiologyRequests.findFirst.mockResolvedValue({
      id: REQ,
      requesting_doctor: { user_id: 'doc-user' },
    });

    await uc.upsertReport(REQ, {
      radiologistId: RAD,
      finalImpression: 'Clear',
      signature: 'Dr Jane',
    });
    expect(prisma.radiologyRequests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'COMPLETED' },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'radiology.report_ready',
      expect.objectContaining({
        type: 'radiology.report_ready',
        payload: expect.objectContaining({
          requestId: REQ,
          doctorUserId: 'doc-user',
        }),
      }),
    );

    prisma.findings.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.reports.findFirst.mockResolvedValue({ id: 'r1' });
    prisma.reports.update.mockResolvedValue({ id: 'r1' });
    events.emit.mockClear();
    await uc.upsertReport(REQ, { radiologistId: RAD, conclusion: 'ok' });
    expect(prisma.reports.update).toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('addImage validates path and assertStatus validates enum', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...requestRow(),
      radiology_findings_request_id: null,
      radiology_reports_request_id: null,
      radiology_images_request_id: [],
    });
    await expect(
      uc.addImage(REQ, { filePath: '  ', uploadedBy: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.images.create.mockResolvedValue({ id: 'i1' });
    await uc.addImage(REQ, {
      filePath: ' /scan.dcm ',
      modality: 'CT',
      uploadedBy: 'u1',
    });
    expect(prisma.images.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ file_path: '/scan.dcm' }),
      }),
    );

    expect(uc.assertStatus('pending')).toBe('PENDING');
    expect(() => uc.assertStatus('NOPE')).toThrow(BadRequestException);
  });
});
