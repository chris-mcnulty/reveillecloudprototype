# Reveille Cloud - SharePoint Online Performance Monitoring Collector

## Overview
Multi-tenant SaaS platform for monitoring SharePoint Online performance across customer tenants. Provides synthetic transaction testing, passive telemetry collection, alerting, and MSP-level visibility.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL via Drizzle ORM (node-postgres driver)
- **Routing**: wouter (frontend), Express (API)
- **SharePoint**: Microsoft Graph API via Replit SharePoint connector (@microsoft/microsoft-graph-client)

## Project Structure
```
client/src/
  pages/           - Route pages (Environments, Dashboard, Tenants, etc.)
  components/      - UI components (shadcn/ui + layout Shell/Sidebar/Header)
  lib/             - API hooks (api.ts), query client, utils
server/
  index.ts         - Express server entry
  routes.ts        - API route handlers (/api/*)
  storage.ts       - Database storage interface (IStorage + DatabaseStorage)
  db.ts            - Drizzle ORM + pg Pool setup
  seed.ts          - Database seeding with org/tenant/test structure (no fake metrics - real data only)
  sharepoint.ts    - Microsoft Graph client auth (Replit SharePoint connector)
  testRunner.ts    - Synthetic test execution engine (Page Load, File Transfer, Search, Auth)
  scheduler.ts     - Automated scheduler (synthetic tests + passive collectors)
  collectors/
    graphReports.ts  - SharePoint usage reports via Graph Reports API (5 report types)
    serviceHealth.ts - M365 Service Health incident collector (auto-creates alerts)
    auditLogs.ts     - SharePoint audit log collector (directory audits, site analytics, drive activity)
shared/
  schema.ts        - Drizzle schema (all tables)
```

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
- `POST /tenants/:id/consent`, `POST /tenants/:id/revoke-consent`
- `GET /tenants/:tenantId/systems`, `POST/PATCH/DELETE /systems`
- `GET /tenants/:tenantId/tests`, `POST/PATCH/DELETE /tests`
- `GET /tenants/:tenantId/alert-rules`, `POST/PATCH/DELETE /alert-rules`
- `GET /tenants/:tenantId/metrics`, `/metrics/latest`, `/metrics/summary`
- `GET/POST /alerts`, `PATCH /alerts/:id/acknowledge`
- `GET /stats` (global MSP stats)
- `GET /sharepoint/status` (Graph API connection check)
- `POST /tests/:id/run` (execute synthetic test)
- `GET /tests/:id/runs` (test execution history)
- `GET /tenants/:tenantId/test-runs` (all runs for a tenant)
- `GET /all-tests` (all tests across tenants)
- `GET /scheduler/status` (in-memory scheduler state for all 4 job types)
- `POST /scheduler/trigger?jobType=` (trigger any job: syntheticTests, graphReports, serviceHealth, auditLogs)
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
- `/alerts` - Alerts & incidents list
- `/reports` - Report generation & scheduling
- `/onboarding` - New tenant onboarding wizard
- `/settings/tenant` - Azure AD integration config
- `/settings/tests` - Synthetic test configuration
- `/settings/alerts` - Alert rule configuration

## Scheduler
- Adapted from Synozur Orbit multi-tenant scheduler pattern (https://github.com/chris-mcnulty/synozur-orbit)
- 4 job types with independent intervals:
  - **syntheticTests**: Every 60s sweep, per-test interval checking
  - **serviceHealth**: Every 5 minutes (near-real-time incident detection)
  - **auditLogs**: Every 15 minutes (per consented tenant)
  - **graphReports**: Every 6 hours (daily aggregate reports)
- Only runs for tenants with `consentStatus === "Connected"`
- Staggered execution with jitter between tests/tenants
- AbortController support for job cancellation
- Stuck job cleanup every 15 minutes (auto-marks jobs running >1 hour as failed)
- Staggered startup: synthetic tests at 10s, service health at 15s, audit logs at 20s, graph reports at 30s
- All job runs persisted to `scheduledJobRuns` table for history/audit

## Passive Collectors
- **Graph Reports** (`server/collectors/graphReports.ts`): Collects 5 SharePoint usage report types via Graph Reports API. Requires `Reports.Read.All` permission. Handles CSV parsing with proper quoted field support.
- **Service Health** (`server/collectors/serviceHealth.ts`): Monitors M365 Service Health for SharePoint/OneDrive/M365 incidents. Creates alerts for new incidents. Requires `ServiceHealth.Read.All` permission.
- **Audit Logs** (`server/collectors/auditLogs.ts`): Collects SharePoint audit events via directory audits, site analytics, and drive activity enumeration. Falls back gracefully through approaches. Requires `AuditLog.Read.All` permission.
- All collectors handle 403 permission errors gracefully with warning logs (no crashes).

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

## External References
- Synozur Orbit (competitive intelligence): https://github.com/chris-mcnulty/synozur-orbit — has multi-tenant task scheduler pattern used as basis for Reveille scheduler
