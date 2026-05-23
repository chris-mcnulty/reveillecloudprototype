# Reveille Cloud — SharePoint Online Performance Monitoring

## Overview
Multi-tenant SaaS platform for monitoring SharePoint Online, M365, Azure AI Foundry, and Copilot performance. Provides synthetic transaction testing, passive telemetry collection, anomaly detection, alerting, and MSP-level multi-tenant visibility.

**Change history:** `changelog.md` | **Backlog:** `backlog.md`

---

## User Preferences
Focus on completing the current task efficiently. Suggest the most straightforward and maintainable approach first. Provide clear, concise explanations for significant architectural decisions. Prioritize existing libraries and patterns. Ask for confirmation before large-scale changes or new features.

---

## System Architecture

**Stack:** React + Vite + TailwindCSS + shadcn/ui (frontend) · Express.js + TypeScript (backend) · PostgreSQL + Drizzle ORM · wouter routing.

Key decisions:
- **Multi-tenant:** "standard" customer orgs and "msp" orgs with distinct UI modes. `TenantContext` provides `isMsp`, `orgTenants`, `organization`, `allOrganizations`.
- **Azure AD app registration:** Client credentials flow for all server-side collectors. Delegated auth (Replit SharePoint connector) for synthetic tests only.
- **Scheduler:** Multi-tenant, independent job intervals, staggered startup, jitter, AbortController cancellation, stuck-job cleanup every 15 min. All runs persisted to `scheduledJobRuns`.
- **Anomaly detection:** Z-score against 7-day hourly baselines, 6 streams, auto-open/recover alert state machine. See `server/anomalyDetection.ts`.
- **Admin audit logging:** All mutating API routes log to `adminAuditLog` via `logAdminAction()`.
- **Query performance:** 38 covering indexes in `shared/schema.ts`, `COUNT(*) OVER()` pagination, CTE aggregations. Target p95 < 200 ms. See `changelog.md` for EXPLAIN ANALYZE baselines.

---

## Organization Model

| Org | Mode | Tenants | Notes |
|---|---|---|---|
| **Cascadia Oceanic** | standard | 1 (itself) | Default on load. MSP features hidden, tenant selector locked. Domain: cascadiaoceanic.sharepoint.com |
| **Synozur** | msp | Acme, Globex, Initech, Soylent | Full multi-tenant UI, tenant selector active |

Real tenant IDs: Cascadia Oceanic `b146d352`, Synozur MSP `9102a596`, Soylent `b142f1f8`, Reveille Software `02546b3b`.

---

## Key Data Models

See `shared/schema.ts` for the full Drizzle schema. Key tables:

| Table | Purpose |
|---|---|
| `organizations` | Top-level entities (mode: standard \| msp) |
| `tenants` | Azure AD consent status, linked to org |
| `monitoredSystems` | Services per tenant (M365, Google Workspace, OpenText) |
| `syntheticTests` / `testRuns` | Test profiles and execution history |
| `alertRules` / `alerts` | Threshold + anomaly + copilot_surface + llm_performance rules and incidents |
| `metrics` | Time-series measurements |
| `scheduledJobRuns` | Scheduler job audit trail |
| `usageReports` | Graph API report snapshots (11 types) |
| `serviceHealthIncidents` | M365 Service Health (global) |
| `auditLogEntries` | SharePoint audit events (per-tenant) |
| `adminAuditLog` | Internal Reveille mutating-action audit trail |
| `agentTraces` / `agentTraceSpans` | End-to-end agent invocation traces + spans |
| `copilotInteractions` | M365 Copilot prompt/response history. Enriched: `attributedSurface`, `responseLatencyMs`, `capabilities[]`. `modelName` reserved — not yet exposed by Graph beta. |
| `entraSignIns` | Entra ID sign-in records with risk/MFA/location |
| `mcpServers` / `mcpToolCalls` | MCP server registry + tool call traces |
| `llmCalls` | LLM call records (model, tokens, cost, latency, cache) |
| `foundryDeployments` / `foundryUsageSnapshots` | Azure AI Foundry deployments + hourly token usage |
| `metricBaselines` / `anomalyStreamConfigs` | 7-day rolling baselines and per-stream sensitivity |
| `skillDefinitions` | Discovered `skill.md` files (OneDrive + SharePoint Agent Assets). Keyed by `(tenantId, driveId, itemId)`. Tracks `contentHash`, `parseStatus`, `status`. |
| `skillUsageEvents` | Per-skill loaded/matched/invoked/failed events |

---

## Scheduler Jobs

Adapted from [Synozur Orbit](https://github.com/chris-mcnulty/synozur-orbit). Only runs for tenants with `consentStatus === "Connected"`.

| Job | Interval | Startup delay |
|---|---|---|
| `syntheticTests` | 60s sweep | 10s |
| `serviceHealth` | 5 min | 15s |
| `auditLogs` | 15 min | 20s |
| `copilotSurfaceEval` | 15 min | — |
| `llmPerfEval` | 15 min | 125s |
| `siteStructure` | 1 hour | 45s |
| `copilotInteractions` | 1 hour | — |
| `anomalyDetection` | 1 hour | — |
| `copilotEnrichmentBackfill` | 6 hours | — |
| `graphReports` | 6 hours | 30s |
| `skillsSharePointDiscovery` | 6 hours | 130s |
| `skillsOneDriveDiscovery` | 6 hours | 145s |

Manual trigger: `POST /api/scheduler/trigger { jobType: "..." }`

---

## Passive Collectors

| Collector | File | Permissions |
|---|---|---|
| Graph Reports (11 types) | `server/collectors/graphReports.ts` | `Reports.Read.All` |
| Service Health | `server/collectors/serviceHealth.ts` | `ServiceHealth.Read.All` |
| Audit Logs (4-source cascade: O365 Mgmt API → directoryAudits → signIns → site fallback) | `server/collectors/auditLogs.ts` | `AuditLog.Read.All`, `ActivityFeed.Read` |
| Site Structure | `server/collectors/siteStructure.ts` | `Sites.Read.All`, `Group.Read.All`, `User.Read.All` |
| Copilot Interactions | `server/collectors/copilotInteractions.ts` | `AiEnterpriseInteraction.Read.All` |
| Skills — SharePoint Agent Assets | `server/collectors/skillsSharePoint.ts` | `Sites.Read.All` |
| Skills — OneDrive (Coworker) | `server/collectors/skillsOneDrive.ts` | `Files.Read.All` |
| Skill parser | `server/collectors/skillParser.ts` | — |
| Foundry Discovery | `server/collectors/foundryDiscovery.ts` | Azure Resource Manager + Monitor |

All collectors handle 403 errors gracefully (warning log, no crash).

---

## API Endpoints

All prefixed with `/api`. Full list in `server/routes.ts`. Major groups:

- **Organizations / Tenants:** CRUD, consent flow, token cache, active org context
- **Azure Auth:** `/auth/azure-app-status`, `/auth/consent-url`, `/auth/callback`
- **Metrics / Alerts / Alert Rules:** list, create, acknowledge; anomaly configs + baselines
- **Scheduler:** status, trigger, reset, cancel, job-run history
- **Synthetic Tests:** CRUD, run, history
- **Graph Reports / Usage Reports / Service Health / Audit Log / Admin Audit**
- **Agent Traces + Spans + Health**
- **Copilot Interactions + Models + Backfill**
- **Entra Sign-Ins**
- **MCP Servers + Tool Calls**
- **LLM Calls + Performance**
- **Foundry Deployments + Snapshots + Cost Allocation**
- **Skills Catalog + Usage Events + Discover**
- **Admin:** saved views, digests, benchmarking, known agents

---

## Frontend Pages

| Route | Page |
|---|---|
| `/` | Tenant Dashboard |
| `/environments` | MSP Global Dashboard |
| `/tenants` | Tenant management |
| `/performance` | Performance explorer |
| `/llm-performance` | LLM call leaderboard (model, agent, cost, latency) |
| `/baselines` | Anomaly baselines explorer |
| `/service-health` | M365 Service Health incidents |
| `/usage-reports` | SharePoint + OneDrive usage reports |
| `/audit-log` | Audit trail (SharePoint + admin, tabbed) |
| `/agent-observability` | Agent Traces · Copilot Interactions · Copilot Models · MCP Servers |
| `/skills` | Skill.md catalog (Catalog · Usage · Health tabs) |
| `/alerts` | Alerts & incidents |
| `/reports` | Report generation & scheduling |
| `/onboarding` | New tenant wizard |
| `/settings/tenant` | Azure AD config + permissions checklist |
| `/settings/tests` | Synthetic test config |
| `/settings/alerts` | Alert rules (threshold, anomaly, copilot_surface, llm_performance) |
| `/settings/scheduler` | Scheduler management |

---

## Azure AD Multi-Tenant App Registration

- Env secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (set in Replit secrets)
- Token acquisition: `server/azureAuth.ts` via `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- Token cache refreshes 60s before expiry; `POST /api/tenants/:id/revoke-consent` clears cache
- Redirect URI: `{app_origin}/api/auth/callback`

**Required Graph Application permissions:**
`Reports.Read.All`, `ServiceHealth.Read.All`, `AuditLog.Read.All`, `Sites.Read.All`, `Files.ReadWrite.All`, `Group.Read.All`, `User.Read.All`, `Directory.Read.All`, `AiEnterpriseInteraction.Read.All`

**Required Office 365 Management APIs permission:**
`ActivityFeed.Read` (real SharePoint audit events)

---

## Branding

Reveille Cloud — logo assets in `attached_assets/`. Open Graph image at `client/public/opengraph.jpg`.

---

## External References

- [Synozur Zenith](https://github.com/chris-mcnulty/synozur-zenith) — M365 reporting & governance app
- [Synozur Orbit](https://github.com/chris-mcnulty/synozur-orbit) — multi-tenant scheduler pattern (basis for Reveille scheduler)
- [Microsoft Graph aiInteraction resource](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/api/ai-services/interaction-export/resources/aiinteractionhistory) — track for `modelName` field availability
