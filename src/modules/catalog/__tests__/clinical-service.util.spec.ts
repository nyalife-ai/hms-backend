import {
  clinicalServiceKind,
  isSystemFeeCode,
} from '../clinical-service.util';

describe('clinical-service.util', () => {
  it('flags system fee codes', () => {
    expect(isSystemFeeCode('CONSULT')).toBe(true);
    expect(isSystemFeeCode('lab')).toBe(true);
    expect(isSystemFeeCode('PROC-CSECTION')).toBe(false);
  });

  it('classifies surgery categories', () => {
    expect(clinicalServiceKind('Surgery')).toBe('surgery');
    expect(clinicalServiceKind('Major procedure-Surgeon fee')).toBe('surgery');
    expect(clinicalServiceKind('Caesarean Delivery')).toBe('surgery');
    expect(clinicalServiceKind('Vaccines')).toBe('service');
    expect(clinicalServiceKind('Antenatal')).toBe('service');
    expect(clinicalServiceKind(null)).toBe('service');
  });
});
