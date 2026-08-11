/**
 * Unit tests — AsyncLocalStorage audit request context.
 */

import {
  getAuditRequestStore,
  runWithAuditContext,
} from '../audit-request.context';

describe('audit-request.context', () => {
  it('exposes store only inside runWithAuditContext', () => {
    expect(getAuditRequestStore()).toBeUndefined();

    const seen = runWithAuditContext(
      {
        skipDepth: 0,
        userId: 'u-9',
        ipAddress: '10.0.0.2',
        userAgent: 'unit-test',
      },
      () => {
        const store = getAuditRequestStore();
        expect(store?.userId).toBe('u-9');
        expect(store?.ipAddress).toBe('10.0.0.2');
        store!.skipDepth = 2;
        return store!.skipDepth;
      },
    );

    expect(seen).toBe(2);
    expect(getAuditRequestStore()).toBeUndefined();
  });
});
