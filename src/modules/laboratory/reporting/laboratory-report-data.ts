/**
 * Normalized view model the laboratory DOCX renderer consumes. Kept
 * deliberately decoupled from Prisma row shapes — the renderer never touches
 * the database directly; `lab-operations.usecase.ts`'s `generateReportDocx`
 * is the only place that maps verified/released records into this shape.
 */

import type { ReportAttachment } from '../../../platform/documents/image-appendix.util';

export type LabAnalyteInterpretation = 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' | null;

export type LabAnalyteResult = {
  parameterName: string;
  unit: string | null;
  referenceRange: string | null;
  observedValue: string | null;
  interpretation: LabAnalyteInterpretation;
  /** Optional display subgroup within a panel (e.g. "Erythrocytes") — admin-configured, never inferred. */
  groupName: string | null;
};

export type LabPanel = {
  panelName: string;
  category: string | null;
  analytes: LabAnalyteResult[];
};

export type LaboratoryReportData = {
  facility: {
    name: string;
    addressLine: string;
    contactLine: string;
  };
  patient: {
    name: string;
    patientNumber: string;
    age: string;
    sex: string;
    phone?: string | null;
    address?: string | null;
    pincode?: string | null;
  };
  request: {
    requestNumber: string;
    priority: string;
  };
  /** Authoritative HMS patient identifier — reused as PID No., never a second invented id. */
  patientIdentifier: string;
  referringProvider: {
    name: string | null;
    department: string | null;
  };
  registration: {
    registeredOn: string;
  };
  collection: {
    collectedOn: string | null;
    sampleTypes: string[];
  };
  reporting: {
    reportedOn: string;
  };
  panels: LabPanel[];
  pathologistRemark: string | null;
  methodologyNote: string | null;
  verifier: {
    name: string | null;
    qualification: string | null;
  };
  identifierValue: string;
  attachments: ReportAttachment[];
};
