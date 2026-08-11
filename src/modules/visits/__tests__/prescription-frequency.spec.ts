/** Mirrors frontend Rx frequency abbreviations used on the doctor desk. */

const PRESCRIPTION_FREQUENCIES = [
  'OD',
  'BD',
  'TDS',
  'QDS',
  'PRN',
  'STAT',
] as const;

describe('prescription frequency abbreviations', () => {
  it('covers once/twice/thrice/qid/as-needed/immediate', () => {
    expect(PRESCRIPTION_FREQUENCIES).toEqual([
      'OD',
      'BD',
      'TDS',
      'QDS',
      'PRN',
      'STAT',
    ]);
  });
});
