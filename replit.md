# Reveille Cloud - SharePoint Online Performance Monitoring Collector

## Overview
Multi-tenant SaaS platform for monitoring SharePoint Online performance across customer tenants. Provides synthetic transaction testing, telemetry dashboards, alerting, and MSP-level visibility.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL via Drizzle ORM (node-postgres driver)
- **Routing**: wouter (frontend), Express (API)

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
  seed.ts          - Database seeding with sample tenants/metrics
shared/
  schema.ts        - Drizzle schema (tenants, systems, tests, alertRules, metrics, alerts)
```

## Key Data Models
- **tenants**: Customer organizations with Azure AD consent status
- **monitoredSystems**: Services per tenant (M365, Google Workspace, OpenText)
- **syntheticTests**: Configured test profiles (page load, file upload, search, auth)
- **alertRules**: Threshold-based alert configurations with notification channels
- **metrics**: Time-series performance measurements
- **alerts**: Generated incident records

## API Endpoints
All prefixed with `/api`:
- `GET/POST /tenants`, `GET/PATCH/DELETE /tenants/:id`
- `GET /tenants/:tenantId/systems`, `POST/PATCH/DELETE /systems`
- `GET /tenants/:tenantId/tests`, `POST/PATCH/DELETE /tests`
- `GET /tenants/:tenantId/alert-rules`, `POST/PATCH/DELETE /alert-rules`
- `GET /tenants/:tenantId/metrics`, `/metrics/latest`, `/metrics/summary`
- `GET/POST /alerts`, `PATCH /alerts/:id/acknowledge`
- `GET /stats` (global MSP stats)

## Frontend Pages
- `/` - MSP Global Dashboard (all tenants overview)
- `/dashboard` - Tenant performance dashboard with charts
- `/tenants` - Tenant management table
- `/performance` - Performance explorer with line/bar charts
- `/alerts` - Alerts & incidents list
- `/reports` - Report generation & scheduling
- `/onboarding` - New tenant onboarding wizard
- `/settings/tenant` - Azure AD integration config
- `/settings/tests` - Synthetic test configuration
- `/settings/alerts` - Alert rule configuration

## Branding
Reveille Cloud with custom logo assets in attached_assets/
