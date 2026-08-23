/**
 * Export analytics payloads as CSV / XLSX using the same metric definitions.
 */

import { Injectable } from '@nestjs/common';
import type { AnalyticsPayload } from '../analytics.types';

@Injectable()
export class AnalyticsExportService {
  public toCsv(payload: AnalyticsPayload): Buffer {
    const lines: string[] = [];
    lines.push(`Domain,${csvEscape(payload.meta.domain)}`);
    lines.push(`From,${csvEscape(payload.meta.from)}`);
    lines.push(`To,${csvEscape(payload.meta.to)}`);
    lines.push(`Generated,${csvEscape(payload.meta.generatedAt)}`);
    lines.push(`Currency,${csvEscape(payload.meta.currency)}`);
    lines.push('');
    lines.push('KPIs');
    lines.push('Key,Label,Value,Previous,Change %,Unit,Definition');
    for (const k of payload.kpis) {
      lines.push(
        [
          k.key,
          k.label,
          k.value,
          k.previousValue ?? '',
          k.changePercent ?? '',
          k.unit,
          k.definition,
        ]
          .map((v) => csvEscape(v))
          .join(','),
      );
    }
    for (const t of payload.tables) {
      lines.push('');
      lines.push(csvEscape(t.label));
      lines.push(t.columns.map(csvEscape).join(','));
      for (const row of t.rows) {
        lines.push(
          t.columns.map((c) => csvEscape(row[c] ?? '')).join(','),
        );
      }
    }
    for (const b of payload.breakdowns) {
      lines.push('');
      lines.push(csvEscape(b.label));
      lines.push('Name,Value,%');
      for (const r of b.rows) {
        lines.push(
          [r.name, r.value, r.pct ?? ''].map(csvEscape).join(','),
        );
      }
    }
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  public toXlsxJson(payload: AnalyticsPayload): Buffer {
    /** Dependency-free XLSX fallback: structured JSON workbook. */
    const workbook = {
      sheets: [
        {
          name: 'KPIs',
          rows: [
            ['Key', 'Label', 'Value', 'Previous', 'Change %', 'Unit', 'Definition'],
            ...payload.kpis.map((k) => [
              k.key,
              k.label,
              k.value,
              k.previousValue ?? '',
              k.changePercent ?? '',
              k.unit,
              k.definition,
            ]),
          ],
        },
        ...payload.tables.map((t) => ({
          name: t.key.slice(0, 28),
          rows: [
            t.columns,
            ...t.rows.map((r) => t.columns.map((c) => r[c] ?? '')),
          ],
        })),
      ],
      meta: payload.meta,
    };
    return Buffer.from(JSON.stringify(workbook, null, 2), 'utf8');
  }
}

function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
