/**
 * File: admission.validator.ts
 * Module: admissions
 * Purpose: Domain validation helper stub.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AdmissionValidator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
