/**
 * Verifies generateReportDocx maps DB rows into LaboratoryReportData
 * correctly — separate from lab-operations.usecase.spec.ts's "renders a
 * real, valid docx buffer" tests, which use the real renderer and can't
 * also inspect the exact data object passed into it.
 */

import { LabOperationsUseCase } from '../use-cases/lab-operations.usecase';
import { generateLaboratoryReportDocx } from '../reporting/laboratory-report.docx';

jest.mock('../reporting/laboratory-report.docx', () => ({
  generateLaboratoryReportDocx: jest.fn().mockResolvedValue(Buffer.from('fake-docx')),
}));

describe('LabOperationsUseCase.generateReportDocx — data mapping', () => {
  const audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
  let prisma: any;
  let ops: LabOperationsUseCase;

  const baseRequest = {
    id: 'req1',
    request_number: 'LAB-TEST01',
    priority: 'NORMAL',
    status: 'COMPLETED',
    request_date: new Date('2026-09-19T08:00:00Z'),
    updated_at: new Date('2026-09-19T09:00:00Z'),
    notes: JSON.stringify({
      orderedTestTypeIds: ['tt1'],
      observations: 'the stool was a bit dry',
      conclusion: 'bla bla',
      text: 'test properly',
    }),
    patient: {
      patient_number: 'PT-001',
      user: {
        core_profiles_user_id: [
          { first_name: 'Ada', last_name: 'Test', date_of_birth: new Date('1995-01-01'), gender: 'Female', phone: '0700', address: '1 Test St', city: 'Nairobi', postal_code: '00100' },
        ],
      },
    },
    requesting_doctor: {
      department_id: 'dept1',
      specialization: null,
      position: null,
      user: { core_profiles_user_id: [{ first_name: 'Peter', last_name: 'Kiprop' }] },
    },
    laboratory_samples_request_id: [
      { sample_type: 'Whole Blood', collected_at: new Date('2026-09-19T08:10:00Z') },
    ],
    laboratory_results_request_id: [
      {
        parameter_id: 'p1',
        result_value: '11.7',
        interpretation: 'LOW',
        performed_by: 'perf-user-1',
        performed_at: new Date('2026-09-19T08:30:00Z'),
        verified_by: 'ver-user-1',
        verified_at: new Date('2026-09-19T08:50:00Z'),
        rel_verified_by: { id: 'ver-user-1' },
      },
    ],
    laboratory_images_request_id: [] as unknown[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      laboratoryRequests: { findFirst: jest.fn().mockResolvedValue(baseRequest) },
      testTypes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tt1',
            test_name: 'Complete Blood Count',
            category: 'Haematology',
            laboratory_test_parameters_test_type_id: [
              {
                id: 'p1',
                test_type_id: 'tt1',
                parameter_name: 'Haemoglobin',
                unit_of_measurement: 'g/dL',
                normal_reference_range: '12.0-16.0',
                group_name: null,
                display_order: 0,
                is_active: true,
              },
            ],
          },
        ]),
      },
      settings: { findMany: jest.fn().mockResolvedValue([]) },
      staffProfiles: {
        findFirst: jest.fn((args: { where: { user_id: string } }) => {
          if (args.where.user_id === 'perf-user-1') {
            return Promise.resolve({
              position: 'Laboratory Technologist',
              qualification: null,
              user: { core_profiles_user_id: [{ first_name: 'Esther', last_name: 'Kipchoge' }] },
            });
          }
          if (args.where.user_id === 'ver-user-1') {
            return Promise.resolve({
              position: null,
              qualification: 'Result verification',
              user: { core_profiles_user_id: [{ first_name: 'Esther', last_name: 'Kipchoge' }] },
            });
          }
          return Promise.resolve(null);
        }),
      },
      departments: { findFirst: jest.fn().mockResolvedValue({ name: 'Cardiology' }) },
    };
    ops = new LabOperationsUseCase(prisma, audit as never);
  });

  it('maps observations/conclusion/notes and the 3-part signature block correctly', async () => {
    await ops.generateReportDocx('req1');

    expect(generateLaboratoryReportDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicalObservations: 'the stool was a bit dry',
        professionalConclusion: 'bla bla',
        clinicalNotes: 'test properly',
        performer: { name: 'Esther Kipchoge', title: 'Laboratory Technologist' },
        verifier: { name: 'Esther Kipchoge', qualification: 'Result verification' },
        referringProvider: { name: 'Peter Kiprop', department: 'Cardiology' },
        patientIdentifier: 'PT-001',
      }),
    );
  });

  it('omits observations/conclusion/notes gracefully when none were entered', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValue({
      ...baseRequest,
      notes: JSON.stringify({ orderedTestTypeIds: ['tt1'] }),
    });
    await ops.generateReportDocx('req1');
    expect(generateLaboratoryReportDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicalObservations: null,
        professionalConclusion: null,
        clinicalNotes: null,
      }),
    );
  });
});
