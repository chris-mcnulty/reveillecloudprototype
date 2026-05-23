# Reveille Cloud — Changelog

Merged task history and implementation notes. See `backlog.md` for upcoming work.

---

## Tasks #1–#10 (merged April–May 2026)

| # | Feature | Key files |
|---|---|---|
| 1 | Azure AI Foundry auto-discovery | `server/collectors/foundryDiscovery.ts`, `shared/schema.ts` |
| 2 | Copilot model monitoring leaderboard | `client/src/pages/AgentObservability.tsx` (CopilotModelsTab) |
| 3 | WebSocket streaming for live metrics | `server/index.ts` (/ws/live), `client/src/lib/wsClient.ts` |
| 4 | LLM cost/budget alerts | `server/storage.ts` (evaluateLlmBudgets), `server/scheduler.ts` |
| 5 | Trace ↔ LLM call correlation | `server/storage.ts` (getTraceWithLlmCalls), `agent_traces` FK |
| 6 | Saved views (alerts, benchmarking) | `saved_views` table, `client/src/components/SavedViews.tsx` |
| 7 | Anomaly detection (Z-score, 6 streams) | `server/anomalyDetection.ts`, `metric_baselines`, `anomaly_stream_configs` |
| 8 | DB index optimization (38 covering indexes) | `shared/schema.ts` (index declarations), `server/storage.ts` rewrites |
| 9 | Bulk export / weekly digests | `server/notifications/`, `scheduled_digests` table |
| 10 | MSP benchmarking | `client/src/pages/Environments.tsx`, `/api/stats` |

## Tasks #11–#22 (merged May 2026)

| # | Feature |
|---|---|
| 11 | Live alert badges + toast notifications |
| 12 | Anomaly notification delivery (email + Teams) |
| 13 | Copilot surface alerts (`copilotSurfaceEval` 15-min job) |
| 14 | Foundry throttle alerts |
| 15 | LLM cost allocation by agent / business unit |
| 16 | Baselines explorer page (`/baselines`) |
| 17 | Foundry trend charts |
| 18 | Saved benchmarking views |
| 19 | Playwright e2e test suite (`tests/e2e/`) |
| 20 | Vitest unit tests (`vitest.config.ts`) |
| 21 | Branded PDF export |
| 22 | LLM performance alert rules (error rate & P95 latency; `llmPerfEval` 15-min job, `windowMinutes` column on `alertRules`) |

## PR #3 — Skill.md monitoring (merged May 23, 2026)

Files: `shared/schema.ts` (+`skill_definitions`, `skill_usage_events`), `server/collectors/skillsSharePoint.ts`, `server/collectors/skillsOneDrive.ts`, `server/collectors/skillParser.ts`, `server/scheduler.ts` (2 new 6h jobs), `server/storage.ts` (+333 lines), `server/routes.ts` (+110 lines), `client/src/pages/Skills.tsx`.

---

## DB Index Strategy — implementation notes

38 covering indexes declared in `shared/schema.ts` as the third argument of each `pgTable(...)`. Applied via `npm run db:push`. All DESC on the time column for `ORDER BY … LIMIT` queries.

Key indexes:
- `metrics_tenant_timestamp_idx`, `alerts_tenant_timestamp_idx` — list endpoints
- `test_runs_tenant_started_idx`, `test_runs_test_started_idx` — run history
- `audit_log_entries_tenant_timestamp_idx` — audit log (no `COUNT(*) OVER()` — full index walk too expensive at 100K+ rows)
- `agent_traces_tenant_started_status_idx` — traces list + agent health
- `copilot_interactions_*` — sessions list + drill-downs
- `mcp_tool_calls_*`, `entra_sign_ins_*`, `llm_calls_*` — respective list endpoints

Aggregation rewrites:
- `getAgentHealthSummary` — single SQL CTE with `DISTINCT ON` + `GROUP BY FILTER` instead of in-memory grouping
- `getCopilotSessions`, `getAgentTraces`, `getCopilotInteractions`, `getMcpToolCalls`, `getEntraSignIns`, `getLlmCalls` — `COUNT(*) OVER()` window pagination (no second round-trip). Returns `{ items, total }` with `X-Total-Count` header.
- `getAuditLogEntries` — plain array (no window count); callers use `/audit-log/stats` for counts.
- `siteStructure.ts` — `iterateGraphPages` async generator follows `@odata.nextLink`; bounded memory regardless of drive size.

### EXPLAIN ANALYZE baselines (dev, post-db:push)

| Query | Plan | Exec |
|---|---|---|
| Copilot sessions list (97 interactions, 8 sessions) | Index Only Scan on `copilot_interactions_tenant_session_created_idx` → GroupAggregate → Sort top-N → Limit. Heap Fetches: 0 | 4.98 ms |
| Audit log list (102,559 rows, no window count) | Limit 200 → Gather Merge → parallel Sort top-N heapsort | ~70–90 ms warm |
| MCP tool calls (3 rows) | Index Scan on `mcp_tool_calls_server_called_idx` | 17 ms |
| Entra sign-ins (94 rows) | Index Scan on `entra_sign_ins_tenant_signin_at_idx` | ~60 ms |
| Agent traces (24 rows) | Index Scan on `agent_traces_tenant_started_status_idx` | <100 ms |
| Agent health summary (4 agents) | Single CTE | 3–25 ms |

### Production EXPLAIN ANALYZE (Task #11, 2026-05-03 — neondb / PG 16.12)

At capture time the prod DB was materially behind dev: missing tables (`llm_calls`, `known_agents`, `foundry_*`, `metric_baselines`, `anomaly_stream_configs`), and missing all 38 Task #8 indexes (only the legacy `entra_sign_ins_tenant_signin_idx` upsert index was present). Every plan was Seq Scan sub-millisecond because tables were empty — not a meaningful scale validation.

Prod data volumes at capture: `audit_log_entries=0`, `copilot_interactions=0`, `entra_sign_ins=0`, `mcp_tool_calls=122`, `agent_traces=12`, `alerts=3`.

**Re-validation checklist (run after next Publish + collector backfill):**
1. Confirm all 38 indexes present via `SELECT indexname FROM pg_indexes WHERE schemaname='public'`.
2. Re-run `EXPLAIN (ANALYZE, BUFFERS)` for all 7 hot list endpoints + `agent_health` CTE.
3. Confirm Index Scan / Index Only Scan on `_tenant_*_at_idx` covering indexes for unfiltered `ORDER BY ts DESC LIMIT N`.
4. Confirm p95 < 200 ms on the largest tenant (Synozur ≈ 100K+ audit rows expected).
