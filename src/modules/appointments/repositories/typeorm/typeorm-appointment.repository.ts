/**
 * File: typeorm-appointment.repository.ts
 * Module: appointments
 * Purpose: TypeORM repository adapter.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CreateAppointmentDto, AppointmentsQueryDto, UpdateAppointmentDto } from '../../dto';
import { Appointment } from '../../domain/appointment.entity';
import { AppointmentName } from '../../domain/value-objects/appointment-name.vo';
import type { IAppointmentRepository, AppointmentPage } from '../../interfaces/appointment-repository.interface';
import { AppointmentOrmEntity } from './appointment.orm-entity';

@Injectable()
export class TypeOrmAppointmentRepository implements IAppointmentRepository {
  public constructor(
    @InjectRepository(AppointmentOrmEntity)
    private readonly repo: Repository<AppointmentOrmEntity>,
  ) {}

  public async save(entity: Appointment): Promise<Appointment> {
    const row = this.repo.create({
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    });
    return this.toDomain(await this.repo.save(row));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async findById(id: string): Promise<Appointment | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Appointment[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: AppointmentsQueryDto): Promise<AppointmentPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.repo.findAndCount({
      where: { deletedAt: IsNull() },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  private toDomain(row: AppointmentOrmEntity): Appointment {
    return Appointment.reconstitute(
      row.id,
      {
        name: AppointmentName.create(row.name),
        description: row.description ?? undefined,
        patientId: '00000000-0000-0000-0000-000000000000',
        doctorId: '00000000-0000-0000-0000-000000000000',
        appointmentDate: row.createdAt,
        startTime: row.createdAt,
        endTime: row.updatedAt,
        createdBy: '00000000-0000-0000-0000-000000000000',
        status: 'SCHEDULED',
      },
      row.createdAt,
      row.updatedAt,
    );
  }
}
