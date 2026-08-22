/**
 * Resolve notification destinations from domain entities (never from raw client phones).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface ResolvedRecipient {
  readonly userId?: string;
  readonly patientId?: string;
  readonly staffProfileId?: string;
  readonly phone?: string;
  readonly email?: string;
}

@Injectable()
export class RecipientResolverService {
  private readonly logger = new Logger(RecipientResolverService.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async resolvePatient(
    patientId: string,
  ): Promise<ResolvedRecipient | null> {
    const row = await this.prisma.patients.findFirst({
      where: { id: patientId, deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
      },
    });
    if (!row) return null;
    const profile = row.user?.core_profiles_user_id?.[0];
    return {
      patientId: row.id,
      userId: row.user_id,
      phone: profile?.phone?.trim() || undefined,
      email: row.user?.email?.trim() || undefined,
    };
  }

  public async resolveUser(userId: string): Promise<ResolvedRecipient | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      include: { core_profiles_user_id: true },
    });
    if (!user) return null;
    const profile = user.core_profiles_user_id?.[0];
    return {
      userId: user.id,
      phone: profile?.phone?.trim() || undefined,
      email: user.email?.trim() || undefined,
    };
  }

  public async resolveStaffProfile(
    staffProfileId: string,
  ): Promise<ResolvedRecipient | null> {
    const staff = await this.prisma.staffProfiles.findFirst({
      where: { id: staffProfileId, deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
      },
    });
    if (!staff) return null;
    const profile = staff.user?.core_profiles_user_id?.[0];
    return {
      staffProfileId: staff.id,
      userId: staff.user_id,
      phone: profile?.phone?.trim() || undefined,
      email: staff.user?.email?.trim() || undefined,
    };
  }

  public async requirePhone(recipient: ResolvedRecipient): Promise<string> {
    const phone = recipient.phone?.trim();
    if (!phone) {
      this.logger.warn(
        `No phone on file userId=${recipient.userId ?? ''} patientId=${recipient.patientId ?? ''}`,
      );
      throw new Error('Recipient has no phone number on file');
    }
    return phone;
  }
}
