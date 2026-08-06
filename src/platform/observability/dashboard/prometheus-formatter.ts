import {
  HistogramPoint,
  MetricLabels,
  MetricPoint,
  MetricsSnapshot,
} from '../metrics/metric.types';

export class PrometheusFormatter {
  public format(snapshot: MetricsSnapshot): string {
    const lines: string[] = [];
    for (const [name, points] of Object.entries(snapshot.counters)) {
      lines.push(`# TYPE ${name} counter`);
      this.appendScalar(lines, name, points);
    }
    for (const [name, points] of Object.entries(snapshot.gauges)) {
      lines.push(`# TYPE ${name} gauge`);
      this.appendScalar(lines, name, points);
    }
    for (const [name, points] of Object.entries(snapshot.histograms)) {
      lines.push(`# TYPE ${name} histogram`);
      for (const point of points) {
        for (const [boundary, count] of Object.entries(point.buckets)) {
          lines.push(
            `${name}_bucket${this.labels(point.labels, { le: boundary })} ${count}`,
          );
        }
        lines.push(`${name}_sum${this.labels(point.labels)} ${point.sum}`);
        lines.push(`${name}_count${this.labels(point.labels)} ${point.count}`);
        this.appendQuantiles(lines, name, point);
      }
    }
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  private appendScalar(
    lines: string[],
    name: string,
    points: readonly MetricPoint[],
  ): void {
    for (const point of points) {
      lines.push(`${name}${this.labels(point.labels)} ${point.value}`);
    }
  }

  private appendQuantiles(
    lines: string[],
    name: string,
    point: HistogramPoint,
  ): void {
    for (const [quantile, value] of Object.entries(point.quantiles)) {
      lines.push(
        `${name}_quantile${this.labels(point.labels, { quantile })} ${value}`,
      );
    }
  }

  private labels(base: MetricLabels, extra: MetricLabels = {}): string {
    const entries = Object.entries({ ...base, ...extra });
    if (entries.length === 0) {
      return '';
    }
    return `{${entries
      .sort(([left]: [string, string], [right]: [string, string]): number =>
        left.localeCompare(right),
      )
      .map(
        ([key, value]: [string, string]): string =>
          `${key}="${this.escape(value)}"`,
      )
      .join(',')}}`;
  }

  private escape(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"');
  }
}
