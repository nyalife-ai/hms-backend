/**
 * File: prescription.orm-entity.ts
 * Module: prescriptions
 * Purpose: TypeORM persistence entity.
 */

import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'prescriptions' })
export class PrescriptionOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
