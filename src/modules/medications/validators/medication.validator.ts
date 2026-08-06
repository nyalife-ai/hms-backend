/**
 * File: medication.validator.ts
 * Module: medications
 * Purpose: Domain validation helper stub.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class MedicationValidator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
