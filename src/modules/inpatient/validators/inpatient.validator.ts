/**
 * File: inpatient.validator.ts
 * Module: inpatient
 * Purpose: Domain validation helper stub.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class InpatientValidator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
