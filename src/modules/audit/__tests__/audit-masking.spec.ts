/**
 * Unit tests — sensitive field masking + field-level diffs for audit logs.
 */

import {
  diffAuditFields,
  maskAuditRecord,
  maskAuditValue,
} from '../audit-masking';

describe('audit-masking', () => {
  describe('maskAuditValue / maskAuditRecord', () => {
    it('masks email, phone, otp, password and tokens', () => {
      const masked = maskAuditRecord({
        email: 'jane.doe@nyalife.health',
        phone: '+254712345678',
        mobile: '0712345678',
        otp: '123456',
        otpCode: '654321',
        password: 'super-secret',
        password_hash: '$2a$10$abcdef',
        accessToken: 'jwt.header.payload',
        authToken: 'slade-token',
        refreshToken: 'refresh-xyz',
        mrn: 'MRN-1001',
        stage: 'CHECKED_IN',
      });

      expect(masked).toEqual(
        expect.objectContaining({
          email: 'j***@nyalife.health',
          phone: '***78',
          mobile: '***78',
          otp: '***',
          otpCode: '***',
          password: '***',
          password_hash: '***',
          accessToken: '***',
          authToken: '***',
          refreshToken: '***',
          mrn: 'MRN-1001',
          stage: 'CHECKED_IN',
        }),
      );
    });

    it('masks nested objects and arrays recursively', () => {
      const masked = maskAuditValue({
        patient: { email: 'amina@nyalife.health', name: 'Amina' },
        contacts: [{ phone: '0700111222' }, { phone: '0700333444' }],
      }) as Record<string, unknown>;

      expect(masked.patient).toEqual({
        email: 'a***@nyalife.health',
        name: 'Amina',
      });
      expect(masked.contacts).toEqual([{ phone: '***22' }, { phone: '***44' }]);
    });

    it('returns null for empty records', () => {
      expect(maskAuditRecord(null)).toBeNull();
      expect(maskAuditRecord(undefined)).toBeNull();
    });
  });

  describe('diffAuditFields', () => {
    it('captures from→to for changed fields and masks sensitive values', () => {
      const changes = diffAuditFields(
        {
          stage: 'CHECKED_IN',
          phone: '+254700000001',
          reasonForVisit: 'ANC',
        },
        {
          stage: 'WAITING_DOCTOR',
          phone: '+254700000002',
          reasonForVisit: 'ANC',
          additionalNotes: 'Priority',
        },
      );

      const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
      expect(byField.stage).toEqual({
        field: 'stage',
        from: 'CHECKED_IN',
        to: 'WAITING_DOCTOR',
      });
      expect(byField.phone).toEqual({
        field: 'phone',
        from: '***01',
        to: '***02',
      });
      expect(byField.additionalNotes).toEqual({
        field: 'additionalNotes',
        from: undefined,
        to: 'Priority',
      });
      expect(byField.reasonForVisit).toBeUndefined();
    });

    it('treats create (no old) as all new fields changed', () => {
      const changes = diffAuditFields(null, {
        mrn: 'MRN-9',
        email: 'xena@nyalife.health',
      });
      expect(changes).toEqual(
        expect.arrayContaining([
          { field: 'mrn', from: undefined, to: 'MRN-9' },
          { field: 'email', from: undefined, to: 'x***@nyalife.health' },
        ]),
      );
    });

    it('treats delete (no new) as all old fields removed', () => {
      const changes = diffAuditFields({ stage: 'COMPLETED' }, null);
      expect(changes).toEqual([
        { field: 'stage', from: 'COMPLETED', to: undefined },
      ]);
    });
  });
});
