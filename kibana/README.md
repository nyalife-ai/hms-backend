# Kibana Saved Objects

`kibana-setup.ndjson` contains pre-configured Kibana saved objects for exploring
the service's logs:

- **Index pattern** — `api-logs-*` (matches the Logstash daily index pattern)
- **Saved searches** — business/transaction events, HTTP 4xx/5xx errors,
  security/auth events, integration/webhook errors, and slow requests (>1s)

All field names are project-agnostic and align with the Elastic Common Schema
(ECS) mappings produced by `logstash/pipeline/api.conf`.

> The `.ndjson` file must contain **only** newline-delimited JSON — no comments
> or blank lines — or the Kibana import will fail.

## Import

Via the UI: **Kibana → Stack Management → Saved Objects → Import**

Via the API:

```bash
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@kibana/kibana-setup.ndjson"
```
