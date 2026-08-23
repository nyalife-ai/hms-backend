/**
 * P0 FCM — missing credentials soft-fail (do not throw / crash worker path).
 */

import { ConfigService } from '@nestjs/config';
import { FcmService } from '../services/fcm.service';

describe('P0 FcmService missing credentials', () => {
  it('send returns ok:false when push credentials are empty', async () => {
    const config = {
      get: () => '',
    } as unknown as ConfigService;

    const fcm = new FcmService(config);
    fcm.onModuleInit();

    expect(fcm.isConfigured()).toBe(false);

    const outcome = await fcm.send({
      token: 'fake-device-token',
      title: 'Test',
      body: 'Body',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.invalidToken).toBe(false);
    expect(outcome.error).toMatch(/FCM is not configured/i);
  });

  it('ensureApp warns and stays not-ready when credentials missing', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const fcm = new FcmService(config);
    const warn = jest
      .spyOn((fcm as any).logger, 'warn')
      .mockImplementation();

    fcm.onModuleInit();

    expect(fcm.isConfigured()).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toMatch(
      /FCM credentials missing/i,
    );
    warn.mockRestore();
  });
});
