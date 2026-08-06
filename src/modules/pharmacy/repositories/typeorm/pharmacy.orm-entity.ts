/**
 * File: pharmacy.orm-entity.ts
 * Module: pharmacy
 * Purpose: TypeORM persistence entity.
 */

import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'pharmacy' })
export class PharmacyOrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
