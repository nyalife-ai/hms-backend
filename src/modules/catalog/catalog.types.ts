export type CatalogPatient = {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  lastVisit: string;
  status: 'Active' | 'Admitted' | 'Discharged';
};

export type CatalogDoctor = {
  id: string;
  userId: string;
  name: string;
  specialty: string;
  /** Short current-load status for display (not a hardcoded schedule). */
  hours: string;
  available: boolean;
  /** Doctor currently has a visit in IN_CONSULTATION stage. */
  currentlyInConsultation: boolean;
  /** Number of visits currently queued for this doctor (WAITING_DOCTOR stage). */
  waitingCount: number;
  phone: string;
  email: string;
};

export type CatalogDepartment = {
  id: string;
  name: string;
  code: string;
  location: string;
  description: string;
  staff: number;
  doctors: number;
  nurses: number;
  specialists: number;
  support: number;
  headName: string | null;
};

export type CatalogMedication = {
  id: string;
  name: string;
  category: string;
  stock: number;
  reorderLevel: number;
  expiry: string;
  unit: string;
};

export type CatalogLabTest = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  range: string;
};

export type CatalogClinicalService = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  standardPrice: string;
  kind: 'service' | 'surgery';
};

export type CatalogStaff = {
  id: string;
  userId: string;
  name: string;
  employeeId: string;
  role: string;
  department: string;
  status: 'Active' | 'On Leave';
};

export type CatalogInsurer = {
  id: string;
  name: string;
  code: string;
  integration: 'SHA' | 'SLADE' | 'MANUAL';
};
