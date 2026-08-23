/**
 * ImagingController — delegates to RadiologyClinicalUseCase with mocks.
 */

import { BadRequestException } from '@nestjs/common';
import { ImagingController } from '../imaging.controller';

describe('ImagingController', () => {
  const clinical = {
    listScanTypes: jest.fn().mockResolvedValue([]),
    createScanType: jest.fn().mockResolvedValue({ id: 'st1' }),
    updateScanType: jest.fn().mockResolvedValue({ id: 'st1' }),
    listRequests: jest.fn().mockResolvedValue([]),
    getRequest: jest.fn().mockResolvedValue({ id: 'r1' }),
    upsertFindings: jest.fn().mockResolvedValue({ ok: true }),
    upsertReport: jest.fn().mockResolvedValue({ ok: true }),
    addImage: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new ImagingController(clinical as never);
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
    await controller.listScanTypes('true', 'CT');
    expect(clinical.listScanTypes).toHaveBeenCalledWith({
      active: true,
      search: 'CT',
    });

    await controller.listScanTypes('false');
    expect(clinical.listScanTypes).toHaveBeenLastCalledWith({
      active: false,
      search: undefined,
    });

    await controller.listScanTypes();
    expect(clinical.listScanTypes).toHaveBeenLastCalledWith({
      active: undefined,
      search: undefined,
    });

    await controller.createScanType({ scanType: 'XRAY' });
    await controller.updateScanType(id, { isActive: false });
    expect(clinical.createScanType).toHaveBeenCalled();
    expect(clinical.updateScanType).toHaveBeenCalledWith(id, {
      isActive: false,
    });
  });

  it('lists and gets requests with numeric take/skip', async () => {
    await controller.listRequests('PENDING', 'pat1', 'q', '10', '5');
    expect(clinical.listRequests).toHaveBeenCalledWith({
      status: 'PENDING',
      patientId: 'pat1',
      search: 'q',
      take: 10,
      skip: 5,
    });

    await controller.listRequests();
    expect(clinical.listRequests).toHaveBeenLastCalledWith({
      status: undefined,
      patientId: undefined,
      search: undefined,
      take: undefined,
      skip: undefined,
    });

    await expect(controller.getRequest(id)).resolves.toEqual({ id: 'r1' });
  });

  it('upserts findings/report using staffProfileId or body radiologistId', async () => {
    await controller.upsertFindings(id, user, { findingsText: 'clear' });
    expect(clinical.upsertFindings).toHaveBeenCalledWith(id, {
      radiologistId: '00000000-0000-4000-8000-000000000099',
      findingsText: 'clear',
      status: undefined,
    });

    await controller.upsertFindings(id, adminNoStaff, {
      radiologistId: 'rad-body',
      status: 'FINAL',
    });
    expect(clinical.upsertFindings).toHaveBeenLastCalledWith(id, {
      radiologistId: 'rad-body',
      findingsText: undefined,
      status: 'FINAL',
    });

    expect(() =>
      controller.upsertFindings(id, adminNoStaff, {}),
    ).toThrow(BadRequestException);

    await controller.upsertReport(id, user, {
      finalImpression: 'normal',
      conclusion: 'ok',
      recommendations: 'n/a',
      signature: 'sig',
    });
    expect(clinical.upsertReport).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        radiologistId: '00000000-0000-4000-8000-000000000099',
        finalImpression: 'normal',
      }),
    );

    expect(() => controller.upsertReport(id, adminNoStaff, {})).toThrow(
      BadRequestException,
    );

    await controller.upsertReport(id, adminNoStaff, {
      radiologistId: 'rad-body',
      finalImpression: 'ok',
    });
    expect(clinical.upsertReport).toHaveBeenLastCalledWith(
      id,
      expect.objectContaining({ radiologistId: 'rad-body' }),
    );
  });

  it('adds image with uploadedBy from current user', async () => {
    await controller.addImage(id, user, {
      filePath: '/img/1.dcm',
      modality: 'CT',
      numberOfImages: 12,
    });
    expect(clinical.addImage).toHaveBeenCalledWith(id, {
      filePath: '/img/1.dcm',
      modality: 'CT',
      numberOfImages: 12,
      uploadedBy: 'u1',
    });
  });
});
