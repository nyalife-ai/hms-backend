import {
  isMpesaCallbackIpAllowed,
  resolveMpesaCallbackAllowlist,
} from '../mpesa-callback-security';

describe('mpesa callback security', () => {
  it('merges env allowlist with defaults', () => {
    const list = resolveMpesaCallbackAllowlist('10.0.0.5');
    expect(list).toContain('10.0.0.5');
    expect(list.some((e) => e.startsWith('196.201.'))).toBe(true);
  });

  it('allows wildcard', () => {
    expect(resolveMpesaCallbackAllowlist('*')).toEqual(['*']);
    expect(isMpesaCallbackIpAllowed('8.8.8.8', ['*'])).toBe(true);
  });

  it('matches prefix and exact IPs', () => {
    const list = resolveMpesaCallbackAllowlist('');
    expect(isMpesaCallbackIpAllowed('196.201.214.10', list)).toBe(true);
    expect(isMpesaCallbackIpAllowed('127.0.0.1', list)).toBe(true);
    expect(isMpesaCallbackIpAllowed('1.2.3.4', list)).toBe(false);
  });
});
