/**
 * File: create-document.dto.spec.ts
 */

import { validate } from 'class-validator';
import { CreateDocumentDto } from '../create-document.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateDocumentDto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new CreateDocumentDto(), {
      name: 'consent.pdf',
      patientId: UUID,
      filePath: '/uploads/consent.pdf',
      uploadedBy: UUID,
      documentType: 'CONSENT',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
