/**
 * RadiologyOperationsUseCase.generateReportDocx — gathers report data and
 * renders the branded DOCX. Exercises the real generator (see
 * reporting/radiology-report.docx.ts) rather than mocking it, since the
 * point of this test is confidence that the assembled options actually
 * produce a valid document.
 */

import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RadiologyOperationsUseCase } from '../use-cases/radiology-operations.usecase';

describe('RadiologyOperationsUseCase.generateReportDocx', () => {
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let prisma: any;
  let ops: RadiologyOperationsUseCase;

  const baseRequest = {
    id: 'req1',
    request_number: 'RAD-TEST01',
    clinical_indication: 'Follow-up scan',
    created_at: new Date('2026-09-18T00:00:00Z'),
    patient: {
      patient_number: 'PT-001',
      user: {
        core_profiles_user_id: [
          { first_name: 'Ada', last_name: 'Test', date_of_birth: new Date('1995-01-01'), gender: 'Female' },
        ],
      },
    },
    requesting_doctor: {
      user: { core_profiles_user_id: [{ first_name: 'Ref', last_name: 'Doc' }] },
    },
    scan_type: { scan_type: 'Pelvic Ultrasound', department: null },
    radiology_findings_request_id: [{ findings_text: '<p>Normal study.</p>' }],
    radiology_reports_request_id: [] as unknown[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      radiologyRequests: { findFirst: jest.fn() },
      settings: { findMany: jest.fn().mockResolvedValue([]) },
      staffProfiles: { findFirst: jest.fn().mockResolvedValue(null) },
      reportTemplates: { findFirst: jest.fn() },
    };
    ops = new RadiologyOperationsUseCase(prisma, audit as never);
  });

  it('throws NotFoundException when the request does not exist', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue(null);
    await expect(ops.generateReportDocx('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when no FINAL/AMENDED report exists', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...baseRequest,
      radiology_reports_request_id: [{ status: 'DRAFT' }],
    });
    await expect(ops.generateReportDocx('req1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('renders a non-empty DOCX buffer for a finalized report', async () => {
    prisma.radiologyRequests.findFirst.mockResolvedValue({
      ...baseRequest,
      radiology_reports_request_id: [
        {
          status: 'FINAL',
          version: 1,
          final_impression: '<p>No acute abnormality.</p>',
          conclusion: null,
          recommendations: 'Routine follow-up.',
          sections_data: null,
          template_id: null,
          signed_at: new Date('2026-09-18T00:00:00Z'),
          finalized_at: new Date('2026-09-18T00:00:00Z'),
          finalized_by: 'rad-user-1',
        },
      ],
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({
      position: 'Sonographer',
      qualification: null,
      user: { core_profiles_user_id: [{ first_name: 'Jane', last_name: 'Rad' }] },
    });

    const buffer = await ops.generateReportDocx('req1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    // A valid .docx is a zip archive — starts with the "PK" local file header signature.
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});

describe('RadiologyOperationsUseCase — image upload/download', () => {
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let prisma: any;
  let storage: any;
  let ops: RadiologyOperationsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      radiologyRequests: { findFirst: jest.fn().mockResolvedValue({ id: 'req1' }) },
      images: {
        create: jest.fn().mockResolvedValue({
          id: 'img1',
          file_name: 'scan.png',
          mime_type: 'image/png',
          file_size: BigInt(11),
          modality: null,
          series_description: null,
          number_of_images: 1,
          created_at: new Date('2026-09-18T00:00:00Z'),
        }),
        findFirst: jest.fn(),
      },
    };
    storage = {
      put: jest.fn().mockResolvedValue({ key: 'radiology/req1/x-scan.png' }),
      get: jest.fn().mockResolvedValue(Buffer.from('bytes')),
      signedUrl: jest.fn().mockResolvedValue('https://signed.example/scan.png'),
    };
    ops = new RadiologyOperationsUseCase(prisma, audit as never, storage);
  });

  it('uploads a file to the storage provider under a namespaced key and audits it', async () => {
    const buffer = Buffer.from('image-bytes');
    await ops.uploadImage('req1', {
      buffer,
      originalname: 'scan.png',
      mimetype: 'image/png',
      size: buffer.length,
      uploadedBy: 'u1',
    });

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^radiology\/req1\/.+-scan\.png$/),
      buffer,
      { contentType: 'image/png' },
    );
    expect(prisma.images.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request_id: 'req1',
          file_name: 'scan.png',
          mime_type: 'image/png',
          uploaded_by: 'u1',
        }),
      }),
    );
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'radiology.images' }),
    );
  });

  it('rejects a file over the size limit', async () => {
    const buffer = Buffer.alloc(10);
    await expect(
      ops.uploadImage('req1', {
        buffer,
        originalname: 'scan.png',
        size: 26 * 1024 * 1024,
        uploadedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when no storage provider is configured', async () => {
    const opsNoStorage = new RadiologyOperationsUseCase(prisma, audit as never, undefined);
    await expect(
      opsNoStorage.uploadImage('req1', {
        buffer: Buffer.from('x'),
        originalname: 'scan.png',
        uploadedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns a signed URL for download metadata', async () => {
    prisma.images.findFirst.mockResolvedValue({
      id: 'img1',
      file_path: 'radiology/req1/x-scan.png',
      file_name: 'scan.png',
      mime_type: 'image/png',
      file_size: BigInt(1234),
    });
    const result = await ops.getImageDownload('img1');
    expect(result).toEqual({
      id: 'img1',
      fileName: 'scan.png',
      mimeType: 'image/png',
      fileSize: 1234,
      url: 'https://signed.example/scan.png',
    });
  });

  it('falls back to a null url when the storage driver cannot sign one', async () => {
    storage.signedUrl.mockRejectedValue(new Error('unsupported'));
    prisma.images.findFirst.mockResolvedValue({
      id: 'img1',
      file_path: 'radiology/req1/x-scan.png',
      file_name: 'scan.png',
      mime_type: 'image/png',
      file_size: null,
    });
    const result = await ops.getImageDownload('img1');
    expect(result.url).toBeNull();
  });

  it('streams the raw content buffer', async () => {
    prisma.images.findFirst.mockResolvedValue({
      id: 'img1',
      file_path: 'radiology/req1/x-scan.png',
      file_name: 'scan.png',
      mime_type: 'image/png',
    });
    const result = await ops.getImageBuffer('img1');
    expect(storage.get).toHaveBeenCalledWith('radiology/req1/x-scan.png');
    expect(result).toEqual({
      buffer: Buffer.from('bytes'),
      fileName: 'scan.png',
      mimeType: 'image/png',
    });
  });

  it('throws NotFoundException for an unknown image id', async () => {
    prisma.images.findFirst.mockResolvedValue(null);
    await expect(ops.getImageDownload('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
