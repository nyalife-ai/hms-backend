/**
 * Pure helper mirroring settleVisit line classification for consult/lab/med
 * vs clinical extras billed by service id.
 */

function classifyVisitBillLines(
  lines: Array<{ description: string }>,
): { consultCount: number; labCount: number; medCount: number } {
  let consultCount = 0;
  let labCount = 0;
  let medCount = 0;
  for (const line of lines) {
    const d = line.description.toLowerCase();
    if (d.startsWith('lab')) labCount += 1;
    else if (d.startsWith('medication') || d.startsWith('med')) medCount += 1;
    else if (d.startsWith('consultation')) consultCount += 1;
  }
  return { consultCount, labCount, medCount };
}

describe('settleVisit line classification', () => {
  it('counts consult/lab/med prefixes and ignores named clinical services', () => {
    const counts = classifyVisitBillLines([
      { description: 'Consultation' },
      { description: 'Lab: CBC' },
      { description: 'Medication: Amoxicillin' },
      { description: 'Caesarean Delivery — Surgeon fee' },
      { description: 'Vaccines - Vaxigrip' },
    ]);
    expect(counts).toEqual({
      consultCount: 1,
      labCount: 1,
      medCount: 1,
    });
  });

  it('does not treat arbitrary service names as consultation fees', () => {
    const counts = classifyVisitBillLines([
      { description: 'Specialist Consultation (Day)' },
    ]);
    // Starts with "specialist", not "consultation" — billed via extraServiceIds
    expect(counts.consultCount).toBe(0);
  });
});
