# Observability Integration Guide

## Stack overview

| Tool | Role | Port (localhost) |
|---|---|---|
| **Prometheus** | Scrapes `/metrics` every 15 s, evaluates alert rules | 9090 |
| **Alertmanager** | Routes fired alerts to notification channels | 9093 |
| **Grafana** | Dashboards for metrics + logs | 3100 |
| **Elasticsearch** | Stores structured log documents | 9200 |
| **Logstash** | Receives JSON logs via Filebeat, enriches, indexes to ES | 5044 (Beats) |
| **Kibana** | Log explorer, saved searches, Discover | 5601 |
| **Filebeat** | Ships app log files + container stdout to Logstash | — |

All ports bind to `127.0.0.1` only. Put a TLS-terminating reverse proxy with
authentication in front of anything that must be reachable externally.

## Log flow

```
Application (port 3000)
  │
  ├── GET /metrics ──────────────────► Prometheus (9090)
  │       (prom-client text format)         │
  │                                    alert rules
  │                                         ├──► Alertmanager (9093) ──► Slack/PagerDuty/...
  │                                         ▼
  │                                   Grafana (3100)
  │                                   dashboards + panels
  │
  └── JSON log files (/app/logs) ───► Filebeat ──beats──► Logstash (5044)
                                                             │ parse / ECS-map / redact / geoip
                                                             ▼
                                                      Elasticsearch (9200)
                                                      index: api-logs-YYYY.MM.dd
                                                             │
                                                             ▼
                                                      Kibana (5601) + Grafana logs panels
```

Direct TCP ingestion into Logstash is disabled (unauthenticated injection risk).
Ship application logs only via Filebeat on the Beats port (5044).

## 1. Configure the application

The application must write newline-delimited JSON logs to `/app/logs/combined.log`
and `/app/logs/error.log` (picked up by Filebeat).

Expose Prometheus metrics at `GET /metrics` using `prom-client`. Protect the
endpoint with a bearer token (`METRICS_TOKEN`) in production.

## 2. Set environment variables

```bash
cp .env.observability .env.observability.local   # or edit in place
```

Required before first start:

- `GRAFANA_ADMIN_PASSWORD` — Grafana admin login
- `KIBANA_ENCRYPTION_KEY` — exactly 32+ random chars (`openssl rand -hex 32`)
- `ENVIRONMENT` — attached to every log event (development/staging/production)

## 3. Start the stack

```bash
docker compose --env-file .env.observability \
  -f docker-compose.yml -f docker-compose.observability.yml up -d

# Check health:
docker compose ps
curl http://localhost:9090/-/ready           # Prometheus
curl http://localhost:9093/-/ready           # Alertmanager
curl http://localhost:9200/_cluster/health   # Elasticsearch
curl http://localhost:5601/api/status        # Kibana
```

## 4. Import Kibana saved objects

```bash
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@kibana/kibana-setup.ndjson"
```

Then visit http://localhost:5601 → Discover → select `api-logs-*`.

## 5. Verify metrics are being scraped

```bash
# Manually scrape (requires METRICS_TOKEN if set):
curl -H "Authorization: Bearer <METRICS_TOKEN>" http://localhost:3000/metrics

# Check Prometheus targets — the 'api' target should show State=UP:
open http://localhost:9090/targets
```

Open Grafana at http://localhost:3100 → Dashboards → Services → **API Overview**
and **Logs Explorer** (auto-provisioned from `grafana/dashboards/`).

## 6. Wire up alert notifications

Alert rules live in `prometheus/alerts.yml`; routing lives in
`alertmanager/alertmanager.yml`. The shipped receivers are placeholders —
connect at least one real channel (Slack, PagerDuty, email, webhook) before
relying on alerts in production.

## Repository layout

| Path | Purpose |
|---|---|
| `prometheus/prometheus.yml` | Scrape targets, rule files, Alertmanager link |
| `prometheus/alerts.yml` | Alerting rules (availability, latency, runtime) |
| `alertmanager/alertmanager.yml` | Alert grouping, routing, receivers |
| `grafana/provisioning/` | Datasource + dashboard provider provisioning |
| `grafana/dashboards/` | Version-controlled dashboard JSON |
| `logstash/config/logstash.yml` | Workers, batching, persistent queue |
| `logstash/pipeline/api.conf` | Ingest pipeline: parse → ECS map → redact → index |
| `filebeat/filebeat.yml` | File + container inputs, Logstash output |
| `kibana/kibana-setup.ndjson` | Index pattern + saved searches |

## Log fields reference

Every log line ingested through the pipeline is mapped to Elastic Common
Schema (ECS) style fields:

| Field | Example | Notes |
|---|---|---|
| `@timestamp` | `2026-07-25T12:00:00.000Z` | ISO8601, normalized by Logstash |
| `log.level` | `info` | normalized (verbose → debug) |
| `service.name` | `UsersService` | class/context name |
| `message` | `Resource created: id=abc` | |
| `app` | `api` | added by pipeline |
| `environment` | `production` | from `ENVIRONMENT` |
| `http.request.method` | `POST` | HTTP requests only |
| `http.response.status_code` | `200` | HTTP requests only |
| `url.path` | `/v1/resources` | HTTP requests only |
| `http.duration_ms` | `142` | HTTP requests only |
| `requestId` | `uuid` | from x-request-id header |
| `tags` | `business_event` | added when a transaction/audit field is present |
| `geo.country_name` | `Kenya` | GeoIP via Logstash |

## Metrics reference (generic conventions)

| Metric | Type | Labels | What it tracks |
|---|---|---|---|
| `http_requests_total` | Counter | method, route, status_code | Every HTTP request |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Request latency |
| `http_requests_in_flight` | Gauge | method | Active requests |
| `http_errors_total` | Counter | method, route, status_code | 4xx + 5xx |
| `business_transactions_initiated_total` | Counter | (domain-specific) | Domain transactions started |
| `business_transactions_completed_total` | Counter | (domain-specific) | Domain transactions succeeded |
| `business_transactions_failed_total` | Counter | reason | Domain transactions failed |
| `integration_events_total` | Counter | source, status | External callbacks/webhooks |
| `background_jobs_queued_total` | Counter | job_type | Queued async work |
| `auth_attempts_total` | Counter | result | Login success/fail |
| `nodejs_heap_size_used_bytes` | Gauge | — | Node.js heap |
| `nodejs_eventloop_lag_seconds` | Gauge | — | Event loop lag |

Rename the `business_*` examples to your domain's terminology when you build
on this scaffold, and update `prometheus/alerts.yml` + the Grafana dashboards
to match.
