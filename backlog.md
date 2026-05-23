# Reveille Cloud — Backlog

Forward-looking work. See `changelog.md` for merged task history.

---

## LLM monitoring & observability

1. **LLM call ingestion endpoints + SDK shim**
   - `llm_calls` table and storage exist; no documented ingest path for agent code outside Foundry.
   - Add `POST /api/tenants/:id/llm-calls/batch` with idempotency on `(tenantId, requestId)` + `server/llm/recorder.ts` wrapper for OpenAI / Anthropic / Azure OpenAI SDKs.
   - Reuse Foundry pricing overrides for `costCents`.

2. **`/llm-performance` cost-and-bottleneck deepening**
   - Extend with: per-agent cost stack, top-cost users, p99 latency trend, error class breakdown.
   - Drill-down from Agent Traces → `getTraceWithLlmCalls` tab (helper already exists).

3. **`llm.cost_spike` + `llm.cache_hit_rate` anomaly streams**
   - Extend `server/anomalyDetection.ts` (currently 6 streams) with two new detectors: `SUM(costCents)/hr` and `AVG(cachedInputTokens / NULLIF(inputTokens, 0))`.
   - Same 7-day hourly baseline + Z-score pattern. Sensitivity in `anomalyStreamConfigs`.

4. **Per-org LLM redaction policy + payload retention**
   - New `llm_redaction_policies` table: `storePromptText "never"|"hash"|"truncated"|"full"`, `maxPromptChars`, `redactPII bool`.
   - Add `promptHash` / `responseHash` (sha256) to `llm_calls`. Recorder consults policy before writing.

5. **Foundry-derived per-call LLM rows**
   - Add Azure Monitor query for per-request metrics (latency, tokens, throttling) and normalize into `llm_calls`.
   - Piggyback on existing 1h foundry discovery cadence.

6. **LLM budget alerts → digest & Teams notifications**
   - Wire `evaluateLlmBudgets` through `server/notifications/budgetAlerts.ts` (Teams + email) and weekly digests.
   - Add `/settings/llm-budgets` page for per-tenant monthly budgets.

7. **Multi-tenant retention policy job**
   - Daily scheduler job pruning `llm_calls`, `mcp_tool_calls`, `entra_sign_ins`, `audit_log_entries` per a per-org `retentionDays` setting (default 90).

8. **`/llm-performance` saved-view → weekly digest delivery**
   - Wire LLM cost saved-views to `scheduledDigests` infra: top-cost agents, error spikes, slowest models.

---

## Skill.md monitoring follow-ups

PR #3 landed `skill_definitions`, `skill_usage_events`, two 6h discovery jobs, and the `/skills` UI. Remaining:

- **Audit-log → skill usage correlation.** Post-process `auditLogEntries` rows whose `itemId` matches a `skill_definitions.itemId`; emit `skill_usage_events` with `event="loaded"`. Passive Coworker telemetry without SDK changes.
- **SDK-side `skillRef` propagation.** Once the LLM recorder shim (item #1 above) is in, agents attach `skillRef` to each LLM call and the FK is populated automatically.
- **Copilot Studio skill-invocation webhook.** Receiver at `/api/integrations/copilot-studio/skill-events` once Microsoft exposes invocation events for declarative agents.
- **Skill drift diffing.** Optional `skill_definition_versions` history table to render diffs when `contentHash` changes.
- **`skill.usage_drop` + `skill.error_rate` anomaly streams.** Per-skill baselines.

---

## Other proposed items

- **MCP tool failure → known-agent correlation.** `mcpToolCalls` has `traceId`; add a JOIN report and a tile on the Known Agent detail.
- **Foundry budget alert rule type.** Extend `alertRules` with `foundry_spend` evaluating `foundryUsageSnapshots`.
- **A2A scheduler hardening.** `agents/a2aDiscovery.ts` exists but isn't on the scheduler; add as 7th job (every 4h) with `agent_discovery_sources.lastError` surfacing.
- **OAuth-consent synthetic test type.** `syntheticTest.type = "oauth_consent"` re-validates token acquisition every 24h to catch silent admin-consent revocations.
- **Power Platform dashboard.** `powerPlatformResources` is collected but unsurfaced; single rollup page (resource counts by type, top makers, env health).
- **Entra ID risk policy alerts.** Alert rule type targeting sign-ins with `riskLevel="high"` above a % threshold.
- **`/settings/llm-budgets` page.** Per-tenant monthly cost caps with carry-over and proration.
