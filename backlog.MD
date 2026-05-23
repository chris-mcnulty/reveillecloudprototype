# Reveille Cloud — Backlog

Tracking forward-looking work. Items marked **(in progress)** have an active branch; items marked **(done)** are merged. Everything else is a candidate to schedule next.

## LLM monitoring & observability

These items formalize the half-built `llm_calls` / `llm_models` data path into a production observability stream. Schema and storage helpers already exist; the gap is ingestion, UI, and alerting.

1. **LLM call ingestion endpoints + SDK shim**
   - `llm_calls` table and `getLlmCalls` storage exist, but there's no documented ingest path for agent code outside Foundry.
   - Add `POST /api/tenants/:id/llm-calls/batch` with idempotency on `(tenantId, requestId)`, plus a `server/llm/recorder.ts` helper that wraps the OpenAI / Anthropic / Azure OpenAI SDKs and emits one row per call.
   - Reuse Foundry pricing overrides for `costCents`. Reuse `insertLlmCallSchema` for validation.

2. **`/llm-performance` cost-and-bottleneck deepening**
   - The page exists. Extend with: per-agent cost stack, top-cost users, p99 latency trend, error class breakdown across the active window.
   - Drill-down from `/agent-observability` Agent Traces → `getTraceWithLlmCalls` tab (helper already exists).

3. **`llm.cost_spike` + `llm.cache_hit_rate` anomaly streams**
   - Extend `server/anomalyDetection.ts` (currently 6 streams) with two new detectors against `llm_calls`: `SUM(costCents)/hr` and `AVG(cachedInputTokens / NULLIF(inputTokens, 0))`.
   - Same 7-day hourly baseline + Z-score pattern. Sensitivity in `anomalyStreamConfigs`.

4. **Per-org LLM redaction policy + payload retention**
   - New `llm_redaction_policies` table per-org: `storePromptText "never"|"hash"|"truncated"|"full"`, `maxPromptChars`, `redactPII bool`.
   - Add `promptHash` / `responseHash` (sha256) to `llm_calls`. Recorder consults policy before writing prompt/response payloads.
   - Required dependency for Skill monitoring (skill usage events may carry prompt fragments).

5. **Foundry-derived per-call LLM rows**
   - `foundryDiscovery.ts` aggregates usage at the deployment level. Add an Azure Monitor query that emits per-request metrics (latency, tokens, throttling) and normalizes them into `llm_calls` so the leaderboard works without an SDK shim.
   - Frequency: piggyback on the existing 1h foundry discovery cadence.

6. **LLM budget alerts → digest & Teams notifications**
   - `llm_budget_eval` already runs hourly via `evaluateLlmBudgets`. Wire delivery through `server/notifications/budgetAlerts.ts` (Teams + email) and surface in weekly digests.
   - Add a `/settings/llm-budgets` page for per-tenant monthly budgets.

7. **Multi-tenant retention policy job**
   - No GC today. Add a daily scheduler job that prunes `llm_calls`, `mcp_tool_calls`, `entra_sign_ins`, `audit_log_entries` per a per-org `retentionDays` setting (default 90, configurable).
   - Vacuums after delete to keep `llm_calls_*_idx` lean.

8. **`/llm-performance` saved-view → weekly digest delivery**
   - `scheduledDigests` infra is in place (Task #34/#35). Wire LLM cost saved-views to weekly digest delivery: top-cost agents, error spikes, slowest models.

## Skill.md monitoring **(in progress on `claude/backlog-llm-monitoring-3iHjB`)**

Discovery and usage tracking for `skill.md` files used by agents:

- **OneDrive** — Coworker-style apps store `skill.md` in users' OneDrive. Collected via Graph `/users/{id}/drive` delta queries.
- **SharePoint Agent Assets library** — Copilot Studio and custom agents store skills in a SharePoint document library (typically named "Agent Assets"). Collected via Graph `/sites/{siteId}/drives/{driveId}/root/delta`.

Schema (`skill_definitions`, `skill_usage_events`), parser, two collectors, scheduler integration, `/skills` UI, and `llm_calls.skill_id` FK are landing on this branch. See commit history for details.

Follow-ups not in this PR:

- **Audit-log → skill usage correlation.** Post-process `auditLogEntries` rows whose target itemId matches a known `skill_definitions.itemId` and emit `skill_usage_events` rows with `event="loaded"`. Gives passive Coworker telemetry without SDK changes.
- **SDK-side `skillRef` propagation.** Once the LLM recorder shim (LLM item #1) is in, agents attach `skillRef` to each LLM call and the FK is populated automatically.
- **Copilot Studio skill-invocation webhook.** Receiver at `/api/integrations/copilot-studio/skill-events` once Microsoft exposes invocation events for declarative agents.
- **Skill drift diffing.** Optional `skill_definition_versions` history table to render diffs when `contentHash` changes.
- **`skill.usage_drop` + `skill.error_rate` anomaly streams.** Per-skill baselines.

## Other proposed items

Not yet sequenced — drop into the next planning pass:

- **MCP tool failure → known-agent correlation.** `mcpToolCalls` has `traceId`; add a JOIN report and a tile on the Known Agent detail.
- **Foundry budget alert rule type.** Extend `alertRules` with `foundry_spend` evaluating `foundryUsageSnapshots`; closes the loop on Task #34 for Foundry.
- **A2A scheduler hardening.** `agents/a2aDiscovery.ts` exists but isn't on the scheduler; add as 7th job (every 4h) with `agent_discovery_sources.lastError` surfacing.
- **OAuth-consent synthetic test type.** New `syntheticTest.type = "oauth_consent"` re-validates token acquisition every 24h to catch silent admin-consent revocations.
- **Power Platform dashboard.** `powerPlatformResources` is collected but unsurfaced; single rollup page (resource counts by type, top makers, env health).
