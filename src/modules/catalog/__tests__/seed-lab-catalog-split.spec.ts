/** Pure helpers mirroring prisma/seed-lab-catalog classification. */

const LAB_CATEGORIES = new Set([
  'Hematology',
  'Chemistry',
  'Microbiology',
  'Parasitology',
  'Biochemistry',
  'Serology',
  'Pathology',
  'Reproductive',
  'Laboratory',
]);

function isLabRow(category: string, hasTemplate: boolean): boolean {
  if (LAB_CATEGORIES.has(category)) return true;
  return hasTemplate;
}

describe('lab catalog CSV split', () => {
  it('routes hematology/chemistry to lab test types', () => {
    expect(isLabRow('Hematology', false)).toBe(true);
    expect(isLabRow('Chemistry', true)).toBe(true);
    expect(isLabRow('Laboratory', false)).toBe(true);
  });

  it('routes consultations/procedures/delivery to clinical services', () => {
    expect(isLabRow('Consultation', false)).toBe(false);
    expect(isLabRow('Procedure', false)).toBe(false);
    expect(isLabRow('Delivery', false)).toBe(false);
    expect(isLabRow('Immunization', false)).toBe(false);
  });
});
