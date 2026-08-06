export const PATIENTS = [
  { id: 'p1', mrn: 'MRN-00412', name: 'Joseph Kamau', age: 46, gender: 'Male' as const, phone: '+254 712 345 678', lastVisit: '2026-08-01', status: 'Active' as const },
  { id: 'p2', mrn: 'MRN-00398', name: 'Mary Atieno', age: 33, gender: 'Female' as const, phone: '+254 733 221 004', lastVisit: '2026-08-02', status: 'Admitted' as const },
  { id: 'p3', mrn: 'MRN-00377', name: 'David Mutua', age: 61, gender: 'Male' as const, phone: '+254 701 887 340', lastVisit: '2026-07-29', status: 'Active' as const },
  { id: 'p4', mrn: 'MRN-00355', name: 'Esther Chebet', age: 27, gender: 'Female' as const, phone: '+254 728 993 015', lastVisit: '2026-07-28', status: 'Discharged' as const },
  { id: 'p5', mrn: 'MRN-00341', name: 'Ali Hassan', age: 54, gender: 'Male' as const, phone: '+254 745 110 267', lastVisit: '2026-07-25', status: 'Active' as const },
  { id: 'p6', mrn: 'MRN-00329', name: 'Lucy Wambui', age: 39, gender: 'Female' as const, phone: '+254 719 456 802', lastVisit: '2026-08-03', status: 'Admitted' as const },
];

export const DOCTORS = [
  { id: 'd1', name: 'Dr. Amina Okello', specialty: 'General Medicine', hours: 'Mon – Fri (08:00 – 17:00)', available: true, phone: '+254 712 000 101', email: 'a.okello@nyalife.health' },
  { id: 'd2', name: 'Dr. Kevin Ndegwa', specialty: 'Cardiology', hours: 'Mon – Fri (08:00 – 14:00)', available: true, phone: '+254 712 000 102', email: 'k.ndegwa@nyalife.health' },
  { id: 'd3', name: 'Dr. Sophia Muthoni', specialty: 'Pediatrics', hours: 'Mon – Fri (10:00 – 18:00)', available: false, phone: '+254 712 000 103', email: 's.muthoni@nyalife.health' },
  { id: 'd4', name: 'Dr. Daniel Omondi', specialty: 'Orthopedics', hours: 'Mon – Thu (08:00 – 12:00)', available: true, phone: '+254 712 000 104', email: 'd.omondi@nyalife.health' },
  { id: 'd5', name: 'Dr. Wanja Kariuki', specialty: 'Dermatology', hours: 'Tue – Sat (13:00 – 20:00)', available: true, phone: '+254 712 000 105', email: 'w.kariuki@nyalife.health' },
  { id: 'd6', name: 'Dr. Laila Hassan', specialty: 'Neurology', hours: 'Mon – Fri (09:00 – 15:00)', available: true, phone: '+254 712 000 106', email: 'l.hassan@nyalife.health' },
  { id: 'd7', name: 'Dr. Mercy Achieng', specialty: 'Radiology', hours: 'Mon – Sun (07:00 – 13:00)', available: true, phone: '+254 712 000 107', email: 'm.achieng@nyalife.health' },
  { id: 'd8', name: 'Dr. Arjun Mehta', specialty: 'Pulmonology', hours: 'Mon – Fri (08:00 – 16:00)', available: false, phone: '+254 712 000 108', email: 'a.mehta@nyalife.health' },
];

export const MEDICATIONS = [
  { id: 'm1', name: 'Amoxicillin 500mg', category: 'Antibiotic', stock: 420, reorderLevel: 100, expiry: '2027-02-15' },
  { id: 'm2', name: 'Paracetamol 500mg', category: 'Analgesic', stock: 85, reorderLevel: 200, expiry: '2026-11-30' },
  { id: 'm3', name: 'Metformin 850mg', category: 'Antidiabetic', stock: 310, reorderLevel: 120, expiry: '2027-06-01' },
  { id: 'm4', name: 'Amlodipine 5mg', category: 'Antihypertensive', stock: 45, reorderLevel: 80, expiry: '2026-10-12' },
  { id: 'm5', name: 'Omeprazole 20mg', category: 'Antacid', stock: 260, reorderLevel: 100, expiry: '2027-01-20' },
];

export const LAB_TEST_CATALOG = [
  { name: 'Complete Blood Count', unit: 'cells/µL', range: '4,500 – 11,000' },
  { name: 'Blood Glucose (Fasting)', unit: 'mmol/L', range: '3.9 – 5.6' },
  { name: 'Lipid Profile (Total Cholesterol)', unit: 'mmol/L', range: '< 5.2' },
  { name: 'HbA1c', unit: '%', range: '4.0 – 5.6' },
  { name: 'Malaria RDT', unit: '', range: 'Negative' },
  { name: 'Urinalysis', unit: '', range: 'Normal' },
];
