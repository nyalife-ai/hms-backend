/**
 * CatalogController — delegates query DTOs to CatalogService.
 */

import { CatalogController } from '../catalog.controller';
import { CatalogService } from '../catalog.service';

describe('CatalogController', () => {
  const catalog = {
    patientSummary: jest.fn().mockResolvedValue({ total: 1 }),
    getPatientDetail: jest.fn().mockResolvedValue({ id: 'p1' }),
    listPatients: jest.fn().mockResolvedValue({ items: [] }),
    listDoctors: jest.fn().mockResolvedValue({ items: [] }),
    listDepartments: jest.fn().mockResolvedValue({ items: [] }),
    listMedications: jest.fn().mockResolvedValue({ items: [] }),
    listLabTests: jest.fn().mockResolvedValue([]),
    listClinicalServices: jest.fn().mockResolvedValue([]),
    listStaff: jest.fn().mockResolvedValue({ items: [] }),
    listInsurers: jest.fn().mockResolvedValue([]),
    appointmentSummary: jest.fn().mockResolvedValue({ total: 0 }),
    getAppointmentDetail: jest.fn().mockResolvedValue({ id: 'a1' }),
    listAppointments: jest.fn().mockResolvedValue({ items: [] }),
    listInventory: jest.fn().mockResolvedValue([]),
    listWards: jest.fn().mockResolvedValue([]),
    listRadiologyQueue: jest.fn().mockResolvedValue({ items: [] }),
    listInvoices: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue([]),
    dashboardSummary: jest.fn().mockResolvedValue({}),
  };

  const controller = new CatalogController(catalog as unknown as CatalogService);
  const user = { id: 'u1', role: 'DOCTOR' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('reads patient summary and detail', async () => {
    await controller.patientSummary();
    expect(catalog.patientSummary).toHaveBeenCalled();
    await controller.patientDetail('p1');
    expect(catalog.getPatientDetail).toHaveBeenCalledWith('p1');
  });

  it('lists patients/doctors/departments/medications with pagination defaults', async () => {
    await controller.patients({});
    expect(catalog.listPatients).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      search: undefined,
      gender: undefined,
      status: undefined,
    });

    await controller.patients({
      page: 2,
      limit: 10,
      search: 'ann',
      gender: 'F',
      status: 'ACTIVE',
    });
    expect(catalog.listPatients).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      search: 'ann',
      gender: 'F',
      status: 'ACTIVE',
    });

    await controller.doctors({
      page: 1,
      limit: 20,
      search: 'doc',
      departmentId: 'dept-1',
    });
    expect(catalog.listDoctors).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: 'doc',
      departmentId: 'dept-1',
    });

    await controller.departments({ page: 3, limit: 5, search: 'cardio' });
    expect(catalog.listDepartments).toHaveBeenCalledWith({
      page: 3,
      limit: 5,
      search: 'cardio',
    });

    await controller.medications({ search: 'para' });
    expect(catalog.listMedications).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      search: 'para',
    });
  });

  it('lists lab, clinical services, staff, and insurers', async () => {
    await controller.labTests();
    expect(catalog.listLabTests).toHaveBeenCalled();

    await controller.clinicalServices({ kind: 'surgery', search: 'append' });
    expect(catalog.listClinicalServices).toHaveBeenCalledWith({
      kind: 'surgery',
      search: 'append',
    });

    await controller.staff({
      page: 1,
      limit: 25,
      search: 'ada',
      role: 'DOCTOR',
      status: 'ACTIVE',
    });
    expect(catalog.listStaff).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      search: 'ada',
      role: 'DOCTOR',
      status: 'ACTIVE',
    });

    await controller.insurers();
    expect(catalog.listInsurers).toHaveBeenCalled();
  });

  it('lists appointments with user scope and detail', async () => {
    await controller.appointmentSummary(user);
    expect(catalog.appointmentSummary).toHaveBeenCalledWith(user);

    await controller.appointmentDetail('a1');
    expect(catalog.getAppointmentDetail).toHaveBeenCalledWith('a1');

    await controller.appointments(user, {
      page: 2,
      limit: 15,
      search: 'fever',
      status: 'SCHEDULED',
      doctorId: 'doc-1',
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(catalog.listAppointments).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 15,
        search: 'fever',
        status: 'SCHEDULED',
        doctorId: 'doc-1',
        from: '2026-01-01',
        to: '2026-01-31',
      },
      user,
    );
  });

  it('exposes inventory, wards, radiology, invoices, conversations, dashboard', async () => {
    await controller.inventory();
    await controller.wards();
    await controller.radiologyQueue({
      page: 1,
      limit: 40,
      search: 'ct',
      status: 'PENDING',
    });
    await controller.invoices();
    await controller.conversations();
    await controller.dashboardSummary();

    expect(catalog.listInventory).toHaveBeenCalled();
    expect(catalog.listWards).toHaveBeenCalled();
    expect(catalog.listRadiologyQueue).toHaveBeenCalledWith({
      page: 1,
      limit: 40,
      search: 'ct',
      status: 'PENDING',
    });
    expect(catalog.listInvoices).toHaveBeenCalled();
    expect(catalog.listConversations).toHaveBeenCalled();
    expect(catalog.dashboardSummary).toHaveBeenCalled();
  });
});
