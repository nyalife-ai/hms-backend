/**
 * BulkImportsController — template/example/validate/commit/errors delegation.
 */

import { BadRequestException } from '@nestjs/common';
import { BulkImportsController } from '../bulk-imports.controller';
import { BulkImportsService } from '../bulk-imports.service';

describe('BulkImportsController', () => {
  const service = {
    getTemplate: jest.fn().mockReturnValue({
      filename: 'doctors-template.csv',
      csv: 'First Name\n',
    }),
    getExample: jest.fn().mockReturnValue({
      filename: 'doctors-example.csv',
      csv: 'First Name\nAmina\n',
    }),
    validate: jest.fn().mockResolvedValue({
      sessionId: 's1',
      validRows: 1,
      invalidRows: 0,
    }),
    commit: jest.fn().mockResolvedValue({ imported: 1, failed: 0 }),
    getErrorsCsv: jest.fn().mockResolvedValue({
      filename: 'doctors-errors.csv',
      csv: 'row,message\n',
    }),
  };

  const controller = new BulkImportsController(
    service as unknown as BulkImportsService,
  );
  const user = { id: 'u1' } as never;

  const mockRes = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      send: jest.fn(),
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('streams template and example CSV downloads', () => {
    const r1 = mockRes();
    controller.template('doctors', r1 as never);
    expect(service.getTemplate).toHaveBeenCalledWith('doctors');
    expect(r1.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      expect.stringContaining('text/csv'),
    );
    expect(r1.send).toHaveBeenCalledWith('First Name\n');

    const r2 = mockRes();
    controller.example('doctors', r2 as never);
    expect(service.getExample).toHaveBeenCalledWith('doctors');
    expect(r2.send).toHaveBeenCalled();
  });

  it('validates uploaded CSV for the actor', async () => {
    const result = await controller.validate(
      'doctors',
      { buffer: Buffer.from('First Name\nAmina\n'), originalname: 'd.csv' },
      user,
    );
    expect(service.validate).toHaveBeenCalledWith(
      'doctors',
      expect.objectContaining({ originalname: 'd.csv' }),
      'u1',
    );
    expect(result).toEqual(
      expect.objectContaining({ sessionId: 's1', validRows: 1 }),
    );
  });

  it('commits a validated session', async () => {
    const result = await controller.commit(
      'doctors',
      { sessionId: 's1' },
      user,
    );
    expect(service.commit).toHaveBeenCalledWith('doctors', 's1', 'u1');
    expect(result).toEqual(expect.objectContaining({ imported: 1 }));
  });

  it('rejects commit without sessionId', () => {
    expect(() => controller.commit('doctors', {}, user)).toThrow(
      BadRequestException,
    );
  });

  it('streams validation error CSV', async () => {
    const r = mockRes();
    await controller.errorsCsv('doctors', 's1', user, r as never);
    expect(service.getErrorsCsv).toHaveBeenCalledWith('doctors', 's1', 'u1');
    expect(r.send).toHaveBeenCalledWith('row,message\n');
  });
});
