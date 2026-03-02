# Reveille Cloud - SharePoint Online Performance Monitoring Collector

## Overview
Multi-tenant SaaS platform for monitoring SharePoint Online performance across customer tenants. Provides synthetic transaction testing, passive telemetry collection, alerting, and MSP-level visibility.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL via Drizzle ORM (node-postgres driver)
- **Routing**: wouter (frontend), Express (API)
- **SharePoint**: Microsoft Graph API via Replit SharePoint connector (@microsoft/microsoft-graph-client)
- **Azure AD Auth**: Multi-tenant app registration with client credentials flow (server/azureAuth.ts)

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
  sharepoint.ts    - Microsoft Graph client auth (Replit SharePoint connector — delegated auth for synthetic tests)
  azureAuth.ts     - Azure AD multi-tenant app auth (client credentials flow for per-tenant token acquisition)
  testRunner.ts    - Synthetic test execution engine (Page Load, File Transfer, Search, Auth)
  scheduler.ts     - Automated scheduler (synthetic tests + passive collectors)
  collectors/
    graphReports.ts  - M365 usage reports via Graph Reports API (14 report types: SP, OneDrive, Teams, Exchange, M365 Apps, Copilot)
    serviceHealth.ts - M365 Service Health incident collector (auto-creates alerts)
    auditLogs.ts     - Unified audit log collector (4 Management API content types: Audit.SharePoint, Audit.General, Audit.Exchange, Audit.AzureActiveDirectory + Graph directoryAudits + signInLogs + site fallback)
    siteStructure.ts - SharePoint site structure collector (subsites, lists, drives, groups, users)
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
- `POST /tenants/:id/consent`, `POST /tenants/:id/revoke-consent` (revoke also clears token cache)
- `GET /auth/azure-app-status` (check if Azure AD app is configured, show client ID and required permissions)
- `GET /auth/consent-url?tenantId=` (generates Microsoft admin consent URL for a tenant)
- `GET /auth/callback` (handles Microsoft admin consent redirect — sets tenant to Connected with Azure tenant ID)
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
- `POST /scheduler/trigger?jobType=` (trigger any job: syntheticTests, graphReports, serviceHealth, auditLogs, siteStructure)
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
- `/alerts` - Alerts & incidents list
- `/reports` - Report generation & scheduling
- `/onboarding` - New tenant onboarding wizard
- `/settings/tenant` - Azure AD integration config
- `/settings/tests` - Synthetic test configuration
- `/settings/alerts` - Alert rule configuration
- `/settings/scheduler` - Scheduler management

## Scheduler
- Adapted from Synozur Orbit multi-tenant scheduler pattern (https://github.com/chris-mcnulty/synozur-orbit)
- 5 job types with independent intervals:
  - **syntheticTests**: Every 60s sweep, per-test interval checking
  - **serviceHealth**: Every 5 minutes (near-real-time incident detection)
  - **auditLogs**: Every 15 minutes (per consented tenant)
  - **graphReports**: Every 6 hours (daily aggregate reports)
  - **siteStructure**: Every 1 hour (subsites, lists/libraries, drives, groups, users)
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

## External References
- Synozur Orbit (competitive intelligence): https://github.com/chris-mcnulty/synozur-orbit — has multi-tenant task scheduler pattern used as basis for Reveille scheduler
