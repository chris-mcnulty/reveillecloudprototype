# Reveille Cloud — Spec Gap Analysis & Prioritized Recommendations

**Date:** 2026-03-17
**Branch:** claude/spec-gap-analysis-ulkk4
**Source:** `replit.md` specification vs. current codebase

---

## Executive Summary

The current codebase is substantially implemented across core data collection, synthetic testing, and multi-tenant management. However, several user-facing capabilities described in the specification are either stubs, partially wired, or missing entirely. The most impactful gaps are in **alert delivery**, **report generation**, and **usage report visualization**. This document lists all identified gaps in priority order with concrete implementation guidance.

---

## Priority 1 — Critical Gaps (Core Product Value)

### P1-1: Alert Notification Delivery

**Gap:** Alert rules support `channels` in the database schema and UI, but no actual notification delivery is implemented. Alerts are created and acknowledged in the app but never sent to external systems.

**Spec requirement:** "Threshold-based alert configurations with notification channels"

**What's missing:**
- Email delivery via SMTP or SaaS (SendGrid, Resend, etc.)
- Microsoft Teams webhook posting
- Slack webhook posting
- Generic webhook (HTTP POST) to arbitrary URLs
- Delivery tracking / retry logic
- Notification deduplication (don't re-alert on same open incident)

**Affected files:** `server/routes.ts` (alert creation), `shared/schema.ts` (`alertRules.channels` field), `client/src/pages/settings/Alerts.tsx`

**Recommendation:** Add a `server/notifications.ts` module with channel-specific senders. Call it from `serviceHealth.ts` (auto-alert creation) and from the alert-creation route. Start with email + Teams webhook as highest-demand channels.

---

### P1-2: Alert Rule Management UI

**Gap:** `client/src/pages/settings/Alerts.tsx` is a UI stub. It renders two hardcoded example rules with read-only badges. The "Edit", "Add Channel", and save buttons have no handlers. There are no API calls to create, update, or delete alert rules despite the backend endpoints existing.

**Spec requirement:** `GET/POST/PATCH/DELETE /alert-rules` endpoints are implemented server-side and unused by the frontend.

**What's missing:**
- Wire "Add Alert Rule" form to `POST /tenants/:id/alert-rules`
- Wire "Edit" to `PATCH /alert-rules/:id`
- Wire "Delete" to `DELETE /alert-rules/:id`
- Dynamic channel management (add email/webhook/Teams channel to a rule)
- Real rule list from `GET /tenants/:id/alert-rules`

**Affected files:** `client/src/pages/settings/Alerts.tsx`, `client/src/lib/api.ts`

---

### P1-3: Report Generation

**Gap:** `client/src/pages/Reports.tsx` is a complete stub. All buttons (Generate PDF, Export CSV, New Schedule, Edit) have no click handlers. Scheduled reports are hardcoded mock data. No backend report generation exists.

**Spec requirement:** `/reports` — Report generation & scheduling

**What's missing:**
- PDF/CSV export of performance data, audit logs, usage reports
- Scheduled report configuration (frequency, recipients, report type)
- Report delivery via email
- Backend endpoint(s): `POST /reports/generate`, `GET /reports/scheduled`, `POST /reports/scheduled`
- Power BI integration (lower priority — see P3)

**Recommendation:** Implement CSV export first (low effort, high value). Add a `POST /reports/export?type=csv&reportType=` endpoint that queries existing data and streams a CSV response. Wire the UI Export CSV button to this endpoint.

---

## Priority 2 — High-Value Gaps

### P2-1: Extended Usage Report Visualization

**Gap:** The Graph Reports collector (`server/collectors/graphReports.ts`) collects 11 report types across SharePoint, OneDrive, Teams, Exchange, and M365 Apps. However, `client/src/pages/UsageReports.tsx` only visualizes `siteUsageDetail` and `activeUsers`. The remaining 9 report types are stored in the `usageReports` table but have no UI.

**Spec requirement:** "5 Graph usage types + 5 site structure types with charts/tables"

**Missing visualizations:**
| Report Type | Description |
|-------------|-------------|
| `siteUsageCounts` | Total sites, active sites trend |
| `storageUsage` | Storage consumption by site |
| `fileActivity` | File operations (viewed, modified, synced, shared) |
| `onedriveUsageDetail` | OneDrive per-user activity |
| `onedriveActivityDetail` | OneDrive file operations |
| `onedriveStorageUsage` | OneDrive storage trend |
| `m365AppUsage` | M365 app platform usage (web, desktop, mobile) |
| `teamsActivity` | Teams messages, meetings, calls |
| `emailActivity` | Exchange email send/receive/read |

**Recommendation:** Add chart panels to `UsageReports.tsx` for the top 4 most-requested: `fileActivity`, `storageUsage`, `teamsActivity`, and `m365AppUsage`. These are already being collected and stored.

---

### P2-2: Synthetic Test Network Phase & DOM Timing Collection

**Gap:** The `syntheticTests` schema includes `collectNetworkPhases` and `collectDomTiming` boolean fields, but `server/testRunner.ts` does not collect or store these metrics. The page load test measures total latency and two broad phases (site resolution, list enumeration) but does not break down network-level timing (DNS, TCP, TLS, TTFB) or DOM timing.

**Spec requirement:** "synthetic transaction testing" with timing breakdowns

**What's missing:**
- DNS resolution time, TCP connect time, TLS handshake time, Time to First Byte (TTFB)
- Content download time
- Storage of phase data in `metrics` table with `phase` label
- UI display in Performance page phase breakdown charts

**Recommendation:** Augment the page load test runner to record Graph API call sub-timings. For browser-style DOM timing, consider a headless browser (Playwright/Puppeteer) integration as a longer-term investment.

---

### P2-3: MSP Cross-Tenant Aggregate Reporting

**Gap:** The MSP Environments dashboard shows per-tenant status cards and global stats, but there is no mechanism to run reports, export data, or view trend analytics across all managed tenants simultaneously.

**Spec requirement:** "MSP-level visibility" — currently limited to status overview

**What's missing:**
- Cross-tenant performance comparison charts (latency by tenant)
- MSP-level aggregate alert summary with drill-down
- Bulk tenant operations (run tests on all tenants, export all audit logs)
- MSP-scoped scheduled reports delivered to MSP admin

**Recommendation:** Add a "Cross-Tenant Analytics" tab to the Environments page with a multi-series Recharts line chart comparing average latency across tenants over 24h/7d/30d.

---

## Priority 3 — Medium Gaps

### P3-1: Non-M365 Monitoring Collectors

**Gap:** The `monitoredSystems` schema supports `serviceType: "M365" | "Google Workspace" | "OpenText"`, but only M365 collectors exist. Google Workspace and OpenText are named in the schema with no implementation.

**Spec requirement:** "Multi-tenant SaaS platform for monitoring SharePoint Online performance" (M365-primary, but multi-workload schema suggests planned expansion)

**What's missing:**
- Google Workspace collector (Admin SDK, Directory API)
- OpenText Content Server collector
- Conditional UI rendering in systems pages for non-M365 system types

**Recommendation:** Defer until M365 feature completeness is achieved. However, ensure the UI gracefully handles non-M365 `serviceType` values rather than breaking.

---

### P3-2: Real-Time Alert Notifications in UI

**Gap:** New alerts are only visible after a page reload or React Query refetch interval. There is no real-time push mechanism.

**Spec requirement:** Implied by "alerting" capability — users expect timely awareness of incidents

**What's missing:**
- WebSocket or Server-Sent Events (SSE) endpoint for live alert broadcast
- Frontend subscription to receive alerts instantly without polling
- Toast/banner notification when a new alert arrives

**Recommendation:** Add an SSE endpoint `GET /api/events/alerts` that emits new alerts as they are created. Wire a global event listener in the React app to trigger toast notifications and invalidate the alerts query cache.

---

### P3-3: Copilot Interaction Rich Context Display

**Gap:** The `copilotInteractions` table stores `contexts`, `mentions`, `attachments`, and `links` JSONB fields. The `AgentObservability.tsx` chat-style renderer does not display any of these rich context fields.

**Spec requirement:** "Copilot prompt/response history" with full interaction context

**What's missing:**
- Referenced document/file display in conversation view
- @mentioned user display
- Attachment previews or links
- Context source panel (which SharePoint documents were referenced)

**Recommendation:** Add a collapsible "Context" panel to the Copilot conversation viewer showing referenced files and mentions when present.

---

### P3-4: Power BI Integration

**Gap:** `Reports.tsx` contains a "Power BI Integration" card as a placeholder. No backend integration exists.

**Spec requirement:** Report generation (implied BI integration for enterprise customers)

**What's missing:**
- Power BI Embedded token acquisition via Azure AD
- Dataset push for performance metrics
- Embedded report viewer

**Recommendation:** Low priority for a prototype. Implement CSV export (P1-3) first; document the Power BI integration path as a roadmap item.

---

## Priority 4 — Lower Priority / Enhancement Gaps

### P4-1: Scheduled Report Email Delivery

**Gap:** Reports page shows a "Scheduled Reports" section with hardcoded examples. No scheduling, template, or email delivery logic exists.

**What's missing:**
- `scheduledReports` schema table
- Cron-based delivery job in scheduler
- Report template system (HTML email with embedded charts)
- Recipient list management per scheduled report

---

### P4-2: Admin Audit Log Viewer Completeness

**Gap:** The `AuditLog.tsx` page has tabs for "SharePoint Audit" and "Admin Activity". The SharePoint audit tab uses `auditLogEntries` table data (collector-populated). The admin activity tab reads from `adminAuditLog`. Both exist in the spec and schema. This appears implemented, but requires verification that both tabs are fully wired to their respective API endpoints (`/audit-log` and `/admin-audit`).

**Recommendation:** Verify that `GET /admin-audit` is called from the Admin Activity tab. Add pagination controls if the admin log grows large.

---

### P4-3: Onboarding Wizard Completeness

**Gap:** `Onboarding.tsx` implements a multi-step wizard for tenant creation. Verify that all steps (org selection, tenant details, Azure AD consent, initial test configuration) complete end-to-end without requiring the user to then manually visit settings pages.

**What may be missing:**
- Final step that triggers initial data collection run on the new tenant
- Redirect to tenant dashboard after onboarding completion
- Azure AD consent step integration with the real consent URL flow

---

### P4-4: Tenant Settings — Graph Permission Validation

**Gap:** `settings/Tenant.tsx` shows a permissions checklist. The checklist items appear static/hardcoded. There is no live check that verifies each required Graph permission is actually granted for the connected tenant.

**What's missing:**
- API endpoint that attempts each required Graph scope and reports which are available
- Dynamic permission status indicators (green/red per permission)
- Guidance when a specific permission is missing

---

## Gap Summary Table

| ID | Gap | Priority | Effort | Impact |
|----|-----|----------|--------|--------|
| P1-1 | Alert notification delivery (email/Teams/webhook) | Critical | Medium | High |
| P1-2 | Alert rule management UI (CRUD wiring) | Critical | Low | High |
| P1-3 | Report generation (CSV/PDF export) | Critical | Medium | High |
| P2-1 | Extended usage report visualization (9 missing types) | High | Low-Medium | Medium |
| P2-2 | Synthetic test network phase & DOM timing | High | Medium | Medium |
| P2-3 | MSP cross-tenant aggregate reporting | High | Medium | Medium |
| P3-1 | Non-M365 collectors (Google Workspace, OpenText) | Medium | High | Low |
| P3-2 | Real-time alert push (SSE/WebSocket) | Medium | Low | Medium |
| P3-3 | Copilot rich context display (files, mentions) | Medium | Low | Low |
| P3-4 | Power BI integration | Medium | High | Low |
| P4-1 | Scheduled report email delivery | Low | High | Low |
| P4-2 | Admin audit log viewer completeness | Low | Low | Low |
| P4-3 | Onboarding wizard end-to-end completeness | Low | Low | Medium |
| P4-4 | Graph permission live validation in tenant settings | Low | Medium | Medium |

---

## Recommended Implementation Order

1. **P1-2** (Alert Rule UI) — Low effort, unblocks P1-1. Wire existing API endpoints to existing UI.
2. **P1-3** (CSV Export) — Low effort, high visible value. Add one API endpoint and one button handler.
3. **P1-1** (Alert Delivery) — Depends on P1-2. Add `server/notifications.ts`, integrate Teams webhook first.
4. **P2-1** (Usage Report Charts) — Data already collected. Add Recharts panels for 4 most-used report types.
5. **P3-2** (Real-time SSE Alerts) — Low effort SSE endpoint, immediately improves UX.
6. **P2-3** (MSP Cross-Tenant Charts) — Recharts multi-series in Environments page.
7. **P2-2** (Synthetic Test Phase Timing) — Augment testRunner for sub-phase metrics.
8. **P3-3** (Copilot Rich Context) — Add collapsible context panel to existing chat view.
9. **P4-3** (Onboarding Completeness) — QA and fix wizard flow.
10. **P4-4** (Permission Validation) — Add live Graph scope checker to settings.
