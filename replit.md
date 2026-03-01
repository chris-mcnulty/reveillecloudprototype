# Reveille Cloud - SharePoint Online Performance Monitoring Collector

## Overview
Multi-tenant SaaS platform for monitoring SharePoint Online performance across customer tenants. Provides synthetic transaction testing, telemetry dashboards, alerting, and MSP-level visibility.

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
  scheduler.ts     - Automated test scheduler (adapted from Synozur Orbit pattern)
shared/
  schema.ts        - Drizzle schema (tenants, systems, tests, alertRules, metrics, alerts, testRuns, scheduledJobRuns)
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
- `GET /scheduler/status` (in-memory scheduler state)
- `POST /scheduler/trigger` (manually trigger test sweep)
- `POST /scheduler/reset/:jobType`, `POST /scheduler/reset-all` (reset stuck jobs)
- `POST /scheduler/cancel/:jobType` (cancel running job)
- `GET /scheduler/job-runs?jobType=&tenantId=&limit=` (persisted job run history)

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
- Sweeps every 60 seconds, checks each test's configured interval vs last run time
- Only runs tests for tenants with `consentStatus === "Connected"`
- Stagers execution with 1-3s jitter between tests, 500ms between tenants (per spec throttling guidelines)
- AbortController support for job cancellation
- Stuck job cleanup every 15 minutes (auto-marks jobs running >1 hour as failed)
- Startup sweep runs 10s after boot to catch any overdue tests
- All job runs persisted to `scheduledJobRuns` table for history/audit

## Branding
Reveille Cloud with custom logo assets in attached_assets/

## External References
- Synozur Orbit (competitive intelligence): https://github.com/chris-mcnulty/synozur-orbit — has multi-tenant task scheduler pattern used as basis for Reveille scheduler
