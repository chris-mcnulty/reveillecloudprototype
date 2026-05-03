# Reveille Cloud - SharePoint Online Performance Monitoring Collector

## Overview
Reveille Cloud is a multi-tenant SaaS platform designed to monitor SharePoint Online performance for customer tenants. It offers synthetic transaction testing, passive telemetry collection, alerting, and provides MSP-level visibility. The platform aims to ensure optimal SharePoint performance, detect issues proactively, and offer comprehensive insights into M365 usage and health.

## User Preferences
I prefer that the agent focuses on completing the current task efficiently. If there are multiple ways to achieve a goal, suggest the most straightforward and maintainable approach first. Provide clear, concise explanations for any significant architectural decisions or code changes. Prioritize the use of existing libraries and patterns over introducing new ones unless there's a clear benefit. I expect the agent to ask for confirmation before making any large-scale changes or introducing new features.

## System Architecture
The application uses a modern web stack with **React**, **Vite**, **TailwindCSS**, and **shadcn/ui** for the frontend, and an **Express.js (TypeScript)** backend. **PostgreSQL** is the database, managed with **Drizzle ORM**. Routing is handled by **wouter** on the frontend and **Express** for the API.

Key architectural decisions include:
- **Multi-tenant Design**: Supports "standard" customer organizations and "msp" organizations with different UI modes and tenant management capabilities.
- **Data Models**: Centralized schema for organizations, tenants, monitored systems, synthetic tests, alerts, metrics, and various collector-specific data (usage reports, service health incidents, audit logs, Copilot interactions, Entra Sign-ins, MCP servers, admin audit logs, and Azure AI Foundry deployments / usage snapshots). Anomaly detection adds two tables — `metricBaselines` (hourly rolling-window stats per tenant×stream: mean/stddev/p50/p95/sampleCount/current/zScore) and `anomalyStreamConfigs` (per-tenant×stream sensitivity 1–6, default 3, with enabled flag) — and extends `alerts` with `alertType` (`threshold` default vs `anomaly`), `streamKey`, and a `payload` JSON column carrying anomaly metadata (current/mean/stddev/zScore/sensitivity/state/followupCount).
- **SharePoint Integration**: Utilizes the Microsoft Graph API, enhanced by the Replit SharePoint connector for delegated authentication in synthetic tests and Azure AD multi-tenant app registration with client credentials for server-side collectors.
- **Automated Scheduler**: An adapted multi-tenant scheduler handles various job types (synthetic tests, service health, audit logs, Graph reports, site structure, Copilot interactions, Azure AI Foundry discovery) with independent intervals, staggered execution, and persistence of job runs.
- **Passive Data Collectors**:
    - **Graph Reports**: Collects 11 types of M365 usage reports (SharePoint, OneDrive, Cross-M365 workloads).
    - **Service Health**: Monitors M365 service health for SharePoint/OneDrive/M365 incidents and generates alerts.
    - **Audit Logs**: Collects audit data from multiple sources including Office 365 Management Activity API, Graph Directory Audits, Graph Sign-Ins, and site analytics with a cascading fallback mechanism.
    - **Site Structure**: Enumerates SharePoint subsites, lists/libraries, drives, M365 Groups, and tenant users.
    - **Copilot Interactions**: Gathers Copilot prompt/response history via Graph API, organizing them into conversation threads and prompt-response pairs.
    - **Foundry Discovery**: Hourly enumeration of Cognitive Services / OpenAI deployments via Azure Resource Manager and Azure Monitor token metrics into `foundry_deployments` / `foundry_usage_snapshots`. Surfaces an RBAC consent prompt on 401/403.
- **Azure AD Multi-Tenant App Registration**: Enables server-side collectors to acquire per-tenant tokens using client credentials flow, supporting admin consent and managing required Graph and Office 365 Management API permissions.
- **Agent Observability**: Features detailed tracing for agent invocations and tool calls, providing insights into the performance and behavior of integrated agents and Copilot interactions.
- **Admin Audit Logging**: All mutating API operations are logged for administrative oversight.
- **Branding**: Reveille Cloud branding with custom logo assets.

## Key Data Models
- **organizations**: Top-level entities (mode: "standard" for customers, "msp" for managed service providers). Controls UI mode.
- **tenants**: Customer tenants with Azure AD consent status, linked to an organization via `organizationId`
- **monitoredSystems**: Services per tenant (M365, Google Workspace, OpenText)
- **syntheticTests**: Configured test profiles (page load, file upload, search, auth)
- **alertRules**: Threshold-based alert configurations with notification channels
- **metrics**: Time-series performance measurements
- **alerts**: Generated incident records
- **testRuns**: Synthetic test execution history with timing breakdowns
- **scheduledJobRuns**: Scheduler job run tracking (status, results, errors, timing)
- **usageReports**: Graph API usage report snapshots (site usage, storage, file counts, active users)
- **serviceHealthIncidents**: M365 Service Health incidents/advisories (global, not per-tenant)
- **auditLogEntries**: SharePoint audit log events (per-tenant)
- **adminAuditLog**: Internal Reveille admin actions (tracks all mutating API operations)
- **agentTraces**: End-to-end agent invocation traces (Copilot, GPT, Agentforce) with status, duration, error summary
- **agentTraceSpans**: Individual spans within an agent trace (auth, content, mcp, license, api, inference)
- **copilotInteractions**: Microsoft 365 Copilot interaction history (prompts/responses) collected via Graph API. Unique on interactionId, grouped by requestId (prompt↔response pair) and sessionId (conversation thread). Enriched columns: `modelName` (reserved — not yet exposed by Graph beta), `attributedSurface` (friendly product name from `from.application.displayName` + `appClass` heuristic, e.g. "M365 Chat", "Outlook", "Word", "Web Chat"), `responseLatencyMs` (aiResponse.createdAt − userPrompt.createdAt within same requestId, capped at 30min), `capabilities[]` (parsed signals: `file-ref`, `file-context`, `link-ref`, `mention`, `summarize`, `drafting`, `search`, `table-gen`, `code-ref`, `image-ref`, `adaptive-card`).
- **entraSignIns**: Microsoft Entra ID sign-in records (per-tenant). Structured columns for user, app, location (geo), status, risk level, conditional access, MFA, device info. Collected from Graph API `/auditLogs/signIns`.
- **mcpServers**: Registered MCP servers with health monitoring (name, transport type, URL, API key, status, heartbeat, capabilities, uptime, restart count). Supports stdio/SSE/streamable-http transports with API key auth.
- **mcpToolCalls**: Individual MCP tool call traces (JSON-RPC method, tool name, params, result, error, duration, session ID). Linked to mcpServers and optionally to agentTraces for correlation.
- **metricBaselines**, **anomalyStreamConfigs**: Rolling 7-day hourly baselines per tenant×stream and per-stream sensitivity config. New columns on **alerts**: `alertType` ("threshold" | "anomaly"), `streamKey`, `payload` (jsonb).

### Anomaly Detection
`server/anomalyDetection.ts` runs hourly via the scheduler:
- 6 streams: `synthetic.latency`, `agent.error_rate`, `llm.ttft`, `llm.error_rate`, `entra.failure_rate`, `mcp.failure_rate`
- 7-day hourly baseline (min 10 samples). Z-score = (latest − mean) / stddev (with stddev floor). Severity by |z|: ≥5 critical, ≥4 warning, else info.
- Per tenant×stream state machine on the latest alert payload: `recovered` + anomalous → fire fresh alert (state=open, followupCount=0); `open` with followupCount=0 still anomalous and ≥4h since first alert → emit single follow-up (followupCount=1, isFollowup=true); `open` with followupCount=1 still anomalous → suppressed; `open` but metric back to normal → mark latest alert payload `state="recovered"` via `updateAlertPayload` (no new alert). One initial + one 4h follow-up per open episode; no time-based auto-close.
- Manual trigger via `POST /api/scheduler/trigger { jobType: "anomalyDetection" }`.

## Organization Model
- **Cascadia Oceanic** (standard): Single-tenant customer org. Domain: cascadiaoceanic.sharepoint.com, admin: chris@chrismcnulty.net. Default on load. MSP features hidden, tenant selector locked.
- **Synozur** (msp): MSP org managing multiple client tenants (Acme, Globex, Initech, Soylent). Full multi-tenant features, tenant selector active.
- Org switcher in header lets user toggle between org contexts.
- `TenantContext` provides `isMsp`, `orgTenants`, `organization`, `allOrganizations` to all components.

## API Endpoints
All prefixed with `/api`:
- `GET /organizations`, `POST /organizations`, `PATCH /organizations/:id`
- `GET /organizations/active?orgId=` (returns org context with tenants, isMsp flag, all orgs)
- `GET/POST /tenants`, `GET/PATCH/DELETE /tenants/:id`
- `POST /tenants/:id/consent`, `POST /tenants/:id/revoke-consent` (revoke also clears token cache)
- `GET /auth/azure-app-status` (check if Azure AD app is configured, show client ID and required permissions)
- `GET /auth/consent-url?tenantId=` (generates Microsoft admin consent URL for a tenant)
- `GET /auth/callback` (handles Microsoft admin consent redirect — sets tenant to Connected with Azure tenant ID)
- `GET /tenants/:tenantId/systems`, `POST/PATCH/DELETE /systems`
- `GET /tenants/:tenantId/tests`, `POST/PATCH/DELETE /tests`
- `GET /tenants/:tenantId/alert-rules`, `POST/PATCH/DELETE /alert-rules`
- `GET /tenants/:tenantId/metrics`, `/metrics/latest`, `/metrics/summary`
- `GET/POST /alerts`, `PATCH /alerts/:id/acknowledge` (GET supports `alertType=anomaly|threshold`, `streamKey`, `since`)
- `GET /anomaly/streams` (catalog of detector streams)
- `GET /tenants/:tenantId/anomaly/configs`, `PUT /tenants/:tenantId/anomaly/configs/:streamKey` (sensitivity + enabled)
- `GET /tenants/:tenantId/anomaly/baselines/:streamKey?sinceHours=`
- `GET /tenants/:tenantId/anomaly/count?hours=`
- `GET /stats` (global MSP stats)
- `GET /sharepoint/status` (Graph API connection check)
- `GET /agent-traces` (list traces, ?tenantId, ?platform, ?status, ?limit)
- `GET /agent-traces/:id` (trace with spans)
- `POST /agent-traces` (create trace)
- `POST /agent-traces/:id/spans` (add span to trace)
- `DELETE /agent-traces/:id` (delete trace + spans)
- `GET /agent-health` (health summary per agent, ?tenantId)
- `POST /agent-traces/seed-demo` (seed 12 demo traces with realistic spans)
- `POST /tests/:id/run` (execute synthetic test)
- `GET /tests/:id/runs` (test execution history)
- `GET /tenants/:tenantId/test-runs` (all runs for a tenant)
- `GET /all-tests` (all tests across tenants)
- `GET /scheduler/status` (in-memory scheduler state for all 4 job types)
- `POST /scheduler/trigger?jobType=` (trigger any job: syntheticTests, graphReports, serviceHealth, auditLogs, siteStructure, copilotInteractions)
- `GET /tenants/:tenantId/copilot-interactions` (list interactions, query: userId, appClass, sessionId, modelName, attributedSurface, limit)
- `GET /tenants/:tenantId/copilot-interactions/stats` (interaction stats: total, users, sessions, app breakdown)
- `GET /tenants/:tenantId/copilot-interactions/sessions/:sessionId` (full conversation thread)
- `GET /tenants/:tenantId/copilot-interactions/pairs/:requestId` (prompt↔response pair)
- `GET /tenants/:tenantId/copilot-models/stats?window=24h|7d|30d|all` (per-model leaderboard: calls, p50/p95/p99 latency, error/empty rate, surface & capability breakdown)
- `GET /tenants/:tenantId/copilot-models/:modelLabel/latency?window=` (latency histogram buckets: <500ms, 500ms-1s, 1-2s, 2-5s, 5-10s, 10-30s, 30s+)
- `POST /api/admin/copilot-models/backfill` (re-extract enrichment + recompute latencies across existing rows; body: `{tenantId?}` to scope; returns `{scanned, updated, latencyComputed, tenantsTouched}`)
- `GET /tenants/:tenantId/entra-signins` (list sign-in records with filters: userId, appName, status, riskLevel, since, limit)
- `GET /tenants/:tenantId/entra-signins/stats` (aggregate stats: totals, MFA rate, risk, top apps, top locations, hourly trend)
- `GET /tenants/:tenantId/entra-signins/users` (per-user breakdown: login count, failures, risk events)
- `POST /tenants/:tenantId/entra-signins/collect` (trigger Graph API collection)
- `POST /tenants/:tenantId/entra-signins/seed-demo` (seed 150 demo sign-in records)
- `GET /tenants/:tenantId/mcp-servers` (list registered MCP servers)
- `POST /tenants/:tenantId/mcp-servers` (register new MCP server)
- `GET /tenants/:tenantId/mcp-servers/stats` (aggregate MCP stats)
- `GET /tenants/:tenantId/mcp-servers/:serverId` (server details + health)
- `PATCH /tenants/:tenantId/mcp-servers/:serverId` (update server config)
- `DELETE /tenants/:tenantId/mcp-servers/:serverId` (remove server)
- `POST /tenants/:tenantId/mcp-servers/:serverId/probe` (discover tools from live server)
- `POST /tenants/:tenantId/mcp-servers/:serverId/call-tool` (execute a tool and log result)
- `POST /tenants/:tenantId/mcp-servers/:serverId/heartbeat` (update heartbeat/status)
- `POST /tenants/:tenantId/mcp-servers/:serverId/tool-calls` (log a tool call)
- `GET /tenants/:tenantId/mcp-servers/:serverId/tool-calls` (list tool calls with filters)
- `POST /tenants/:tenantId/mcp-servers/test-connection` (test URL + auth before registering)
- `POST /tenants/:tenantId/mcp-servers/seed-demo` (seed demo MCP servers + tool calls)
- `POST /scheduler/reset/:jobType`, `POST /scheduler/reset-all` (reset stuck jobs)
- `POST /scheduler/cancel/:jobType` (cancel running job)
- `GET /scheduler/job-runs?jobType=&tenantId=&limit=` (persisted job run history)
- `GET /tenants/:tenantId/usage-reports?reportType=&since=` (Graph usage reports)
- `GET /tenants/:tenantId/usage-reports/latest?reportType=` (latest usage report)
- `GET /service-health` (active M365 service health incidents)
- `GET /service-health/incidents?tenantId=&status=` (filtered incidents)
- `GET /tenants/:tenantId/audit-log?operation=&since=&limit=` (SharePoint audit log)
- `GET /tenants/:tenantId/audit-log/stats` (audit log counts by operation)
- `GET /admin-audit?tenantId=&since=&limit=` (internal admin audit trail)

## Frontend Pages
- `/` - Tenant Dashboard (default single-tenant view with charts)
- `/environments` - MSP Global Dashboard (multi-tenant overview, special case)
- `/tenants` - Tenant management table
- `/performance` - Performance explorer with line/bar charts
- `/service-health` - M365 Service Health incidents & advisories (global)
- `/usage-reports` - SharePoint usage reports per tenant (5 Graph usage types + 5 site structure types with charts/tables)
- `/audit-log` - SharePoint audit trail + internal admin activity (tabbed)
- `/agent-observability` - Agent Observability (tabbed: Agent Traces + Copilot Interactions + **Copilot Models** + MCP Servers). Copilot Models tab mirrors the LLM Performance leaderboard for M365 Copilot: 6-card metric grid (total interactions, p50/p95/p99 latency, empty-response rate, surface count), surface bar chart, capability list, sortable per-model leaderboard with drill-down (latency distribution histogram + per-model surface/capability breakdown), 24h/7d/30d/all window selector, and a per-tenant Backfill button.
- `/alerts` - Alerts & incidents list
- `/reports` - Report generation & scheduling
- `/onboarding` - New tenant onboarding wizard
- `/settings/tenant` - Azure AD integration config
- `/settings/tests` - Synthetic test configuration
- `/settings/alerts` - Alert rule configuration
- `/settings/scheduler` - Scheduler management

## Scheduler
- Adapted from Synozur Orbit multi-tenant scheduler pattern (https://github.com/chris-mcnulty/synozur-orbit)
- 6 job types with independent intervals:
  - **syntheticTests**: Every 60s sweep, per-test interval checking
  - **serviceHealth**: Every 5 minutes (near-real-time incident detection)
  - **auditLogs**: Every 15 minutes (per consented tenant)
  - **graphReports**: Every 6 hours (daily aggregate reports)
  - **siteStructure**: Every 1 hour (subsites, lists/libraries, drives, groups, users)
  - **copilotInteractions**: Every 1 hour (Copilot prompt/response history via Graph API)
- Only runs for tenants with `consentStatus === "Connected"`
- Staggered execution with jitter between tests/tenants
- AbortController support for job cancellation
- Stuck job cleanup every 15 minutes (auto-marks jobs running >1 hour as failed)
- Staggered startup: synthetic tests at 10s, service health at 15s, audit logs at 20s, graph reports at 30s, site structure at 45s
- All job runs persisted to `scheduledJobRuns` table for history/audit

## Passive Collectors
- **Graph Reports** (`server/collectors/graphReports.ts`): Collects 11 report types across M365 workloads. Handles both JSON and CSV response formats.
  - SharePoint: siteUsageDetail, siteUsageCounts, storageUsage, fileActivity, activeUsers
  - OneDrive: onedriveUsageDetail, onedriveActivityDetail, onedriveStorageUsage
  - Cross-M365: m365AppUsage, teamsActivity, emailActivity
  - All require `Reports.Read.All` permission
- **Service Health** (`server/collectors/serviceHealth.ts`): Monitors M365 Service Health for SharePoint/OneDrive/M365 incidents. Creates alerts for new incidents. Requires `ServiceHealth.Read.All` permission.
- **Audit Logs** (`server/collectors/auditLogs.ts`): Multi-source audit collection with cascading fallback:
  1. Office 365 Management Activity API (`manage.office.com`) — real SharePoint operations (FileAccessed, SharingSet, PermissionChanged, SearchQueryPerformed, etc.). Requires `ActivityFeed.Read` on Office 365 Management APIs. Auto-starts Audit.SharePoint subscription.
  2. Graph `/auditLogs/directoryAudits` — Entra ID directory audits (app consents, role changes, user provisioning). Requires `AuditLog.Read.All`.
  3. Graph `/auditLogs/signIns` — SharePoint Online sign-in events with risk/MFA/location data. Requires `AuditLog.Read.All`.
  4. Site fallback — Site analytics, list modifications, drive recent items via `Sites.Read.All`.
- **Site Structure** (`server/collectors/siteStructure.ts`): Enumerates subsites, lists/libraries, drive structure (files/folders/quota), M365 Groups, and tenant users. Requires `Sites.Read.All`, `Group.Read.All`, `User.Read.All` permissions.
- **Copilot Interactions** (`server/collectors/copilotInteractions.ts`): Collects Copilot prompt/response history per-user via `/copilot/users/{id}/interactionHistory/getAllEnterpriseInteractions`. Groups by requestId (prompt↔response pairs) and sessionId (conversations). Incremental collection with unique constraint dedup. Requires `AiEnterpriseInteraction.Read.All` permission. On insert, runs `extractCopilotEnrichment(rawData)` (`server/collectors/copilotEnrichment.ts`) to parse `attributedSurface` (from `from.application.displayName` / `appClass` — `IPM.SkypeTeams.Message.Copilot.<surface>` strip + BizChat→"M365 Chat" / WebChat→"Web Chat" normalization) and `capabilities[]` (from `contexts`, `attachments`, `links`, `mentions`, `appClass`, body content). For aiResponse rows, computes `responseLatencyMs` = createdAt − matching userPrompt createdAt (same `tenantId`+`requestId`), capped at 1800s. `modelName` is reserved — as confirmed against Microsoft Learn (Graph beta `aiInteractionHistory: getAllEnterpriseInteractions`, verified May 2026), the documented `aiInteraction` schema currently exposes only `id`, `sessionId`, `requestId`, `appClass`, `interactionType`, `conversationType`, `etag`, `createdDateTime`, `locale`, `contexts`, `from`, and `body` — there is **no confirmed model-identifier field yet**. To stay future-proof, `MODEL_NAME_PATHS` in `server/collectors/copilotEnrichment.ts` probes the most-likely Microsoft naming conventions (`modelInfo.{name,modelName,id}`, `metadata.{modelName,modelId,model}`, `attribution.{modelName,model.name}`, `body.modelInfo.name`, `aiModel.{name,id}`, `model.{name,id}`, top-level `model`/`modelName` strings) so a value flowing on any of those paths populates automatically. The scheduler runs `backfillCopilotEnrichment()` every 6 hours (`copilotEnrichmentBackfillInterval` in `server/scheduler.ts`) so historical rows are re-enriched retroactively without per-tenant code changes; the manual `POST /api/admin/copilot-models/backfill` endpoint forces an immediate pass. The Copilot Models leaderboard (`AgentObservability.tsx` → CopilotModelsTab) auto-hides the "model name not yet exposed by Graph" hint as soon as any row in the dataset has a populated `modelName`. **When Microsoft publishes the official path** (track [aiInteraction resource type docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/api/ai-services/interaction-export/resources/aiinteractionhistory)), ADD it to `MODEL_NAME_PATHS` (don't replace existing probes — older preview paths must keep resolving on rows already collected) and replace this paragraph with the confirmed JSON path. Backfill is non-destructive: only fills NULL columns and only computes latency when both prompt and response exist for the same requestId.
- All collectors handle 403 permission errors gracefully with warning logs (no crashes).

## Azure AD Multi-Tenant App Registration
- When `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` env secrets are set, collectors use client credentials flow instead of the Replit SharePoint connector
- Per-tenant token acquisition via `server/azureAuth.ts` using `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- Admin consent flow: `/api/auth/consent-url?tenantId=` generates Microsoft consent URL, `/api/auth/callback` handles the redirect
- Token cache with automatic expiry (refreshes 60s before expiration)
- Tenant settings UI shows step-by-step Azure AD registration instructions when secrets are not configured
- When secrets ARE configured, "Grant Admin Consent" button redirects to real Microsoft consent page
- Required Microsoft Graph Application permissions: Reports.Read.All, ServiceHealth.Read.All, AuditLog.Read.All, Sites.Read.All, Files.ReadWrite.All, Group.Read.All, User.Read.All, Directory.Read.All
- Required Office 365 Management APIs Application permission: ActivityFeed.Read (for real SharePoint audit events)
- Management API token acquisition via `server/azureAuth.ts` `getManagementApiToken()` using `https://manage.office.com/.default` scope
- Redirect URI: `{app_origin}/api/auth/callback`
- Synthetic tests continue using the Replit SharePoint connector (delegated auth)
- Tenant Settings page shows comprehensive workload-organized permissions checklist and M365 Admin Configuration Checklist

## Admin Audit Logging
All mutating API routes log to `adminAuditLog` table via `logAdminAction()` helper:
- Tenant: create, update, delete, consent, revoke-consent
- Tests: create, update, delete, manual run
- Alert rules: create, update, delete
- Alert acknowledgement
- Monitored systems: create, update, delete
- Scheduler: trigger, reset, cancel
- Organizations: create, update

## Branding
Reveille Cloud with custom logo assets in attached_assets/

## Query Performance & Indexes
Database index strategy targeting p95 < 200ms on hot list endpoints. Indexes are declared as the third argument of each `pgTable(...)` in `shared/schema.ts` and applied via `npm run db:push`.

### Covering indexes (all DESC on time column for `ORDER BY ... LIMIT`)
- `metrics_tenant_timestamp_idx (tenant_id, timestamp DESC)` — `/metrics` lists.
- `alerts_tenant_timestamp_idx (tenant_id, timestamp DESC)` — `/alerts` lists.
- `test_runs_tenant_started_idx`, `test_runs_test_started_idx` — tenant + per-test run history.
- `scheduled_job_runs_*` — created_at, plus tenant/jobType/test variants for `/scheduler/job-runs` filters.
- `usage_reports_tenant_type_collected_idx (tenant_id, report_type, collected_at DESC)` — `/usage-reports` lists and `latest`.
- `service_health_incidents_external_idx`, `service_health_incidents_tenant_collected_idx` — incident upserts and lists.
- `audit_log_entries_tenant_timestamp_idx (tenant_id, timestamp DESC)` — `/audit-log`.
- `admin_audit_log_tenant_timestamp_idx (tenant_id, timestamp DESC)` — `/admin-audit`.
- `power_platform_resources_tenant_collected_idx`, `..._tenant_type_idx` — Power Platform inventory.
- `agent_traces_tenant_started_status_idx (tenant_id, started_at DESC, status)`, `agent_traces_tenant_agent_started_idx (tenant_id, agent_name, platform, started_at DESC)` — `/agent-traces` and `/agent-health`.
- `agent_trace_spans_trace_sort_idx (trace_id, sort_order)` — span detail lookups.
- `copilot_interactions_*` — created_at for sessions list, plus session_id, request_id, user_id index for drill-downs (`/copilot-interactions/...`).
- `mcp_tool_calls_tenant_server_called_idx`, `mcp_tool_calls_server_called_idx`, `mcp_tool_calls_tenant_called_idx` — `/mcp-servers/.../tool-calls` and stats.
- `entra_sign_ins_tenant_signin_at_idx (tenant_id, sign_in_at DESC)`, `entra_sign_ins_tenant_user_signin_idx (tenant_id, user_id, sign_in_at DESC)` — list + per-user breakdown. The existing unique `(tenant_id, sign_in_id)` index is retained for upserts.
- `spe_access_events_tenant_timestamp_idx`, `spe_access_events_tenant_container_timestamp_idx`, `spe_security_events_tenant_timestamp_idx` — SPE event lists.
- `spe_containers_tenant_container_idx` — unique upsert key.
- `known_agents_tenant_discovered_idx`, unique `known_agents_tenant_external_idx` — agent registry.
- `llm_calls_tenant_called_idx`, `llm_calls_model_called_idx`, `llm_calls_tenant_agent_called_idx` — LLM call lists and per-model/agent stats.

### Aggregation rewrites
- `getAgentHealthSummary` (`server/storage.ts`) replaced its per-row in-memory grouping with a single SQL CTE: `DISTINCT ON (agent_name, platform)` for the latest trace and a `GROUP BY` with `FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours')` for success rate and avg latency. Avoids streaming all traces into Node.
- `getLlmStats`, `getMcpServerStats`, `getEntraSignInStats`, `getCopilotInteractionStats` already use single SQL aggregations (kept as-is).

### Pagination
- `COUNT(*) OVER()` window-based pagination is used by 5 of the 6 hot list helpers — `getCopilotSessions`, `getAgentTraces`, `getCopilotInteractions`, `getMcpToolCalls`, `getEntraSignIns`, `getLlmCalls` — eliminating the second `SELECT COUNT(*)` round trip on the common case. Each returns `{ items, total }` and accepts an `offset`; routes surface the total via the `X-Total-Count` response header so existing JSON-array consumers are unaffected. When the page is empty AND `offset > 0` (overshoot), a one-off `SELECT COUNT(*)` with the same WHERE clause is run so the caller still gets a correct total instead of a misleading `0`.
- `getAuditLogEntries` deliberately does NOT use `COUNT(*) OVER()`. With 100K+ rows per tenant the windowed count would force a full index walk and break the <200 ms p95 budget. The helper returns a plain array via a top-N `Index Scan using audit_log_entries_tenant_timestamp_idx`. Callers needing aggregate counts can use `/audit-log/stats` (already grouped per operation).
- `siteStructure.ts` — removed the `drives.slice(0, 10)` and `folders.slice(0, 20)` caps in `collectDriveStructure`. The collector now uses an `iterateGraphPages` async generator that follows `@odata.nextLink` for both `/sites/root/drives` and each `/drives/{id}/root/children`, yielding one item at a time. Per-drive aggregates (file/folder counts, estimated total files, top-50 sample) are computed with rolling counters during iteration, so memory stays bounded regardless of drive count or per-drive item count. Result is written as a single `usage_reports` row keyed by `reportType: "driveStructure"`, preserving the existing read contract. The 300 ms throttle between drives is preserved.

### EXPLAIN ANALYZE baselines (real Synozur data, captured post-`db:push`)
- **Copilot sessions list** (97 interactions across 8 sessions, tenantId filter):
  - Plan: `Index Only Scan using copilot_interactions_tenant_session_created_idx` → `GroupAggregate` → `Sort top-N` → `Limit`.
  - `Heap Fetches: 0`, **execution 4.98 ms** (down from a Seq Scan + sort + grouping path).
  - The new `(tenant_id, session_id, created_at DESC)` composite is what enables the index-only scan; the old `(tenant_id, session_id)` did not cover `max(created_at)`.
- **Audit log list** (102,559 rows for tenant, no window count):
  - Plan: `Limit 200` → `Gather Merge` → parallel `Sort top-N heapsort` over `audit_log_entries` filtered by `tenant_id`.
  - **execution ~100 ms in DB, ~70–90 ms warm end-to-end** — well under the 200 ms p95 budget. Removing the `COUNT(*) OVER()` window cut wall time by ~10×.
- **MCP tool calls** (3 rows): `Index Scan using mcp_tool_calls_server_called_idx`, **17 ms** end-to-end.
- **Entra sign-ins** (94 rows for tenant): `Index Scan using entra_sign_ins_tenant_signin_at_idx`, ~60 ms end-to-end.
- **Agent traces** (24 rows): `Index Scan using agent_traces_tenant_started_status_idx`, sub-100 ms.
- **LLM calls** (0 rows for tenant): `Index Scan using llm_calls_tenant_called_idx`, sub-20 ms.
- **Agent health summary** (4 agents, real data): single CTE, **3–25 ms** (verified at runtime via `/api/agent-health`).
- Agent traces list → seq scan on the empty dev table (1 row); will use `agent_traces_tenant_started_status_idx` once populated.

Re-run `EXPLAIN (ANALYZE, BUFFERS)` against the production DB to validate p95 targets after schema deploy.

## External References
- **Zenith** (M365 reporting & governance app): https://github.com/chris-mcnulty/synozur-zenith — Chris's app for reporting on and governing M365
- Synozur Orbit (competitive intelligence): https://github.com/chris-mcnulty/synozur-orbit — has multi-tenant task scheduler pattern used as basis for Reveille scheduler

## External Dependencies
- **Microsoft Graph API**: Core for SharePoint integration, M365 reports, service health, audit logs, Copilot interactions, and Entra Sign-ins.
- **Office 365 Management Activity API**: Used for detailed SharePoint audit events (`ActivityFeed.Read` permission).
- **Azure Resource Manager + Azure Monitor**: Used by the Foundry discovery collector to enumerate Cognitive Services / OpenAI deployments and pull token usage metrics. Required RBAC for the discovery service principal: Reader on the subscription, Monitoring Reader on each Cognitive Services account.
- **Replit SharePoint connector**: Used for delegated authentication in synthetic tests.
- **PostgreSQL**: Primary database for data storage.
- **Drizzle ORM**: ORM for interacting with PostgreSQL.
- **node-postgres**: PostgreSQL client for Node.js.
- **Express.js**: Web application framework for the backend API.
- **React**: Frontend JavaScript library.
- **Vite**: Frontend build tool.
- **TailwindCSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **Recharts**: Charting library for data visualization.
- **wouter**: Small routing library for React.

## Foundry Cost Allocation (Task #23)
- `foundry_pricing_overrides` table: per-deployment input/output $/Mtok overrides.
- `GET /api/tenants/:id/foundry/cost-allocation?windowHours=24|168|720` — joins authoritative `foundry_usage_snapshots` (latest per windowHours) with `llm_calls` aggregated over [now-windowHours, now] grouped by (model, agent, platform). Pricing precedence: override > llmModels rate. Per-agent share prorated by tokens; remainder = unallocated.
- `GET/PUT/DELETE /api/tenants/:id/foundry/pricing-overrides[/:deploymentId]`.
- `GET /api/tenants/:id/exports/foundry-cost-allocation?format=csv|xlsx`.
- UI: `/llm-performance` → "Cost allocation" tab — window selector, totals, per-deployment expandable agent rows, "Edit pricing" dialog, CSV export.
- Business unit proxy: `knownAgents.platform`.
