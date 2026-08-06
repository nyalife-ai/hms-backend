/**
 * File: follow-up.validator.ts
 * Module: follow-ups
 * Purpose: Domain validation helper stub.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class FollowUpValidator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
