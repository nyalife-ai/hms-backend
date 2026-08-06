/**
 * File: appointment.validator.ts
 * Module: appointments
 * Purpose: Domain validation helper stub.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppointmentValidator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
