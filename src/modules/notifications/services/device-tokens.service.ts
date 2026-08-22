/**
 * Persist FCM device tokens (communications.device_tokens).
 * Tokens are resolved by userId at send time — modules never pass raw push destinations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async register(input: {
    userId: string;
    token: string;
    platform: DevicePlatform;
    deviceId?: string;
  }): Promise<{ id: string; token: string; platform: string }> {
    const token = input.token.trim();
    const now = new Date();

    if (input.deviceId?.trim()) {
      const byDevice = await this.prisma.deviceTokens.findFirst({
        where: {
          user_id: input.userId,
          device_id: input.deviceId.trim(),
        },
      });
      if (byDevice) {
        const updated = await this.prisma.deviceTokens.update({
          where: { id: byDevice.id },
          data: {
            token,
            platform: input.platform,
            is_active: true,
            last_seen_at: now,
          },
        });
        return {
          id: updated.id,
          token: updated.token,
          platform: updated.platform,
        };
      }
    }

    const row = await this.prisma.deviceTokens.upsert({
      where: { token },
      create: {
        user_id: input.userId,
        token,
        platform: input.platform,
        device_id: input.deviceId?.trim() || null,
        is_active: true,
        last_seen_at: now,
      },
      update: {
        user_id: input.userId,
        platform: input.platform,
        device_id: input.deviceId?.trim() || null,
        is_active: true,
        last_seen_at: now,
      },
    });

    this.logger.log(
      `Device token registered userId=${input.userId} platform=${input.platform}`,
    );
    return { id: row.id, token: row.token, platform: row.platform };
  }

  public async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.deviceTokens.updateMany({
      where: { user_id: userId, token: token.trim() },
      data: { is_active: false },
    });
  }

  public async listActiveTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceTokens.findMany({
      where: { user_id: userId, is_active: true },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  public async deactivateTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await this.prisma.deviceTokens.updateMany({
      where: { token: { in: tokens } },
      data: { is_active: false },
    });
  }
}
