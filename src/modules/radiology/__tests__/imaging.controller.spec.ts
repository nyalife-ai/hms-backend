/**
 * ImagingController — delegates to RadiologyOperationsUseCase (config/read)
 * and RadiologyJourneyUseCase (lifecycle) with mocks.
 */

import { BadRequestException, StreamableFile } from '@nestjs/common';
import { ImagingController } from '../imaging.controller';

describe('ImagingController', () => {
  const ops = {
    listScanTypes: jest.fn().mockResolvedValue([]),
    createScanType: jest.fn().mockResolvedValue({ id: 'st1' }),
    updateScanType: jest.fn().mockResolvedValue({ id: 'st1' }),
    listReportTemplates: jest.fn().mockResolvedValue([]),
    getReportTemplate: jest.fn().mockResolvedValue({ id: 'tpl1' }),
    createReportTemplate: jest.fn().mockResolvedValue({ id: 'tpl1' }),
    updateReportTemplate: jest.fn().mockResolvedValue({ id: 'tpl1' }),
    listRequests: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    uploadImage: jest.fn().mockResolvedValue({ ok: true }),
    getImageDownload: jest.fn().mockResolvedValue({ id: 'img1', url: null }),
    getImageBuffer: jest.fn().mockResolvedValue({
      buffer: Buffer.from('bytes'),
      fileName: 'scan.png',
      mimeType: 'image/png',
    }),
    deleteImage: jest.fn().mockResolvedValue(undefined),
  };
  const journey = {
    createRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    scheduleRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    checkIn: jest.fn().mockResolvedValue({ id: 'r1' }),
    startExam: jest.fn().mockResolvedValue({ id: 'r1' }),
    completeExam: jest.fn().mockResolvedValue({ id: 'r1' }),
    cancelRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    markNoShow: jest.fn().mockResolvedValue({ id: 'r1' }),
    finalizeRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    enterFindings: jest.fn().mockResolvedValue({ ok: true }),
    enterReport: jest.fn().mockResolvedValue({ ok: true }),
    amendReport: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new ImagingController(ops as never, journey as never);
  const id = '00000000-0000-4000-8000-000000000001';
  const user = {
    id: 'u1',
    role: 'RADIOLOGIST',
    staffProfileId: '00000000-0000-4000-8000-000000000099',
  } as never;
  const adminNoStaff = {
    id: 'admin',
    role: 'ADMIN',
    staffProfileId: undefined,
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('lists and mutates scan types with active filter parsing', async () => {
    await controller.listScanTypes({ active: 'true', search: 'CT' });
    expect(ops.listScanTypes).toHaveBeenCalledWith({
      active: true,
      departmentId: undefined,
      search: 'CT',
    });

    await controller.listScanTypes({ active: 'false' });
    expect(ops.listScanTypes).toHaveBeenLastCalledWith({
      active: false,
      departmentId: undefined,
      search: undefined,
    });

    await controller.createScanType({ scanType: 'XRAY' }, user);
    expect(ops.createScanType).toHaveBeenCalledWith({
      scanType: 'XRAY',
      actorUserId: 'u1',
    });

    await controller.updateScanType(id, { isActive: false }, user);
    expect(ops.updateScanType).toHaveBeenCalledWith(id, {
      isActive: false,
      actorUserId: 'u1',
    });
  });

  it('lists and gets requests with page/limit mapped to take/skip', async () => {
    await controller.listRequests({
      status: 'PENDING',
      patientId: 'pat1',
      search: 'q',
      take: 10,
      skip: 5,
    });
    expect(ops.listRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        patientId: 'pat1',
        search: 'q',
        take: 10,
        skip: 5,
      }),
    );

    await expect(controller.getRequest(id)).resolves.toEqual({ id: 'r1' });
  });

  it('creates a request via the journey use-case using the current user as requester', async () => {
    await controller.createRequest(
      { patientId: 'p1', scanTypeId: 'st1' } as never,
      user,
    );
    expect(journey.createRequest).toHaveBeenCalledWith({
      patientId: 'p1',
      scanTypeId: 'st1',
      requestedBy: 'u1',
    });
  });

  it('drives the lifecycle actions through to the journey use-case', async () => {
    await controller.scheduleRequest(id, { scheduledAt: '2026-01-01' } as never, user);
    expect(journey.scheduleRequest).toHaveBeenCalledWith(id, {
      scheduledAt: '2026-01-01',
      actorUserId: 'u1',
    });

    await controller.checkIn(id, user);
    expect(journey.checkIn).toHaveBeenCalledWith(id, 'u1');

    await controller.startExam(id, user);
    expect(journey.startExam).toHaveBeenCalledWith(id, 'u1');

    await controller.completeExam(id, user);
    expect(journey.completeExam).toHaveBeenCalledWith(id, 'u1');

    await controller.cancelRequest(id, { reason: 'patient request' }, user);
    expect(journey.cancelRequest).toHaveBeenCalledWith(id, {
      reason: 'patient request',
      actorUserId: 'u1',
    });

    await controller.markNoShow(id, user);
    expect(journey.markNoShow).toHaveBeenCalledWith(id, 'u1');

    await controller.finalizeRequest(id, user);
    expect(journey.finalizeRequest).toHaveBeenCalledWith(id, 'u1');
  });

  it('enters findings/report using staffProfileId or body radiologistId', async () => {
    await controller.enterFindings(id, user, { findingsText: 'clear' });
    expect(journey.enterFindings).toHaveBeenCalledWith(id, {
      findingsText: 'clear',
      radiologistId: '00000000-0000-4000-8000-000000000099',
      actorUserId: 'u1',
    });

    await controller.enterFindings(id, adminNoStaff, {
      radiologistId: 'rad-body',
      status: 'FINALIZED',
    });
    expect(journey.enterFindings).toHaveBeenLastCalledWith(id, {
      radiologistId: 'rad-body',
      status: 'FINALIZED',
      actorUserId: 'admin',
    });

    expect(() => controller.enterFindings(id, adminNoStaff, {})).toThrow(
      BadRequestException,
    );

    await controller.enterReport(id, user, {
      finalImpression: 'normal',
      conclusion: 'ok',
      recommendations: 'n/a',
      finalize: true,
    });
    expect(journey.enterReport).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        radiologistId: '00000000-0000-4000-8000-000000000099',
        finalImpression: 'normal',
        finalize: true,
      }),
    );

    expect(() => controller.enterReport(id, adminNoStaff, {})).toThrow(
      BadRequestException,
    );
  });

  it('amends a report with a required reason', async () => {
    await controller.amendReport(id, user, {
      reportId: 'rep1',
      finalImpression: 'revised',
      reason: 'typo correction',
    } as never);
    expect(journey.amendReport).toHaveBeenCalledWith(id, {
      reportId: 'rep1',
      finalImpression: 'revised',
      reason: 'typo correction',
      radiologistId: '00000000-0000-4000-8000-000000000099',
      actorUserId: 'u1',
    });
  });

  it('uploads an image with uploadedBy from current user', async () => {
    const file = {
      buffer: Buffer.from('fake-bytes'),
      originalname: 'scan.dcm',
      mimetype: 'application/dicom',
      size: 10,
    };
    await controller.uploadImage(id, file, user, {
      modality: 'CT',
      numberOfImages: 12,
    });
    expect(ops.uploadImage).toHaveBeenCalledWith(id, {
      buffer: file.buffer,
      originalname: 'scan.dcm',
      mimetype: 'application/dicom',
      size: 10,
      modality: 'CT',
      numberOfImages: 12,
      uploadedBy: 'u1',
    });
  });

  it('rejects an image upload with no file', () => {
    expect(() => controller.uploadImage(id, undefined, user, {})).toThrow(
      'File is required',
    );
  });

  it('gets image download metadata', async () => {
    await controller.downloadImage('img1');
    expect(ops.getImageDownload).toHaveBeenCalledWith('img1');
  });

  it('streams image content with the right headers', async () => {
    const res = { set: jest.fn() } as never;
    const result = await controller.streamImage('img1', res);
    expect(ops.getImageBuffer).toHaveBeenCalledWith('img1');
    expect((res as { set: jest.Mock }).set).toHaveBeenCalledWith({
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="scan.png"',
    });
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('deletes an image with the current user as actor', async () => {
    await controller.deleteImage('img1', user);
    expect(ops.deleteImage).toHaveBeenCalledWith('img1', 'u1');
  });
});
