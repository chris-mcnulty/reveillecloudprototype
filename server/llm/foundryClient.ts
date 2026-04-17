import { storage } from "../storage";
import type { InsertLlmCall, LlmModel } from "@shared/schema";

export type FoundryMessage = { role: "system" | "user" | "assistant"; content: string };

export interface FoundryChatRequest {
  modelId: string;
  messages: FoundryMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  agentId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  agentName?: string | null;
  metadata?: Record<string, any>;
}

export interface FoundryChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  ttftMs: number;
  tokensPerSec: number;
  requestId: string | null;
  status: "success" | "error";
  errorClass?: string;
  errorMessage?: string;
  callId: string;
}

type ErrorClass = "rate_limit" | "context_overflow" | "timeout" | "auth" | "server_error" | "other";

function classifyError(status: number | undefined, message: string): ErrorClass {
  const msg = (message || "").toLowerCase();
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) return "rate_limit";
  if (status === 401 || status === 403 || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("api key")) return "auth";
  if (msg.includes("context length") || msg.includes("maximum context") || msg.includes("token limit")) return "context_overflow";
  if (status === 408 || msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (status && status >= 500) return "server_error";
  return "other";
}

function computeCostCents(model: LlmModel, inputTokens: number, outputTokens: number): number | null {
  if (model.inputCostPerMtok == null || model.outputCostPerMtok == null) return null;
  const inputDollars = (inputTokens / 1_000_000) * model.inputCostPerMtok;
  const outputDollars = (outputTokens / 1_000_000) * model.outputCostPerMtok;
  return (inputDollars + outputDollars) * 100;
}

function resolveEndpoint(model: LlmModel): string | null {
  if (model.endpointEnvVar) {
    const val = process.env[model.endpointEnvVar];
    if (val) return val;
  }
  return model.endpoint ?? null;
}

function resolveApiKey(model: LlmModel): string | null {
  if (!model.apiKeyEnvVar) return null;
  return process.env[model.apiKeyEnvVar] ?? null;
}

async function recordCall(
  model: LlmModel,
  req: FoundryChatRequest,
  partial: Partial<InsertLlmCall>,
): Promise<string> {
  const call = await storage.createLlmCall({
    tenantId: model.tenantId,
    modelId: model.id,
    agentId: req.agentId ?? null,
    traceId: req.traceId ?? null,
    spanId: req.spanId ?? null,
    agentName: req.agentName ?? null,
    operation: "chat.completions",
    temperature: req.temperature ?? null,
    maxTokensRequested: req.maxTokens ?? null,
    stream: req.stream ?? false,
    metadata: req.metadata ?? null,
    calledAt: new Date(),
    ...partial,
  } as InsertLlmCall);
  return call.id;
}

export async function foundryChatCompletion(req: FoundryChatRequest): Promise<FoundryChatResult> {
  const model = await storage.getLlmModel(req.modelId);
  if (!model) throw new Error(`LLM model not found: ${req.modelId}`);

  const endpoint = resolveEndpoint(model);
  const apiKey = resolveApiKey(model);

  const start = Date.now();

  if (!endpoint) {
    const duration = Date.now() - start;
    const callId = await recordCall(model, req, {
      durationMs: duration,
      status: "error",
      errorClass: "other",
      errorMessage: `Endpoint not configured (endpointEnvVar=${model.endpointEnvVar ?? "<none>"})`,
    });
    return {
      content: "",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: duration,
      ttftMs: 0,
      tokensPerSec: 0,
      requestId: null,
      status: "error",
      errorClass: "other",
      errorMessage: "Endpoint not configured",
      callId,
    };
  }

  if (!apiKey) {
    const duration = Date.now() - start;
    const callId = await recordCall(model, req, {
      durationMs: duration,
      status: "error",
      errorClass: "auth",
      errorMessage: `API key missing (apiKeyEnvVar=${model.apiKeyEnvVar ?? "<none>"})`,
    });
    return {
      content: "",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: duration,
      ttftMs: 0,
      tokensPerSec: 0,
      requestId: null,
      status: "error",
      errorClass: "auth",
      errorMessage: `API key missing in env ${model.apiKeyEnvVar ?? "<none>"}`,
      callId,
    };
  }

  const stream = req.stream ?? false;
  const body: Record<string, any> = {
    messages: req.messages,
    stream,
  };
  if (model.deploymentName) body.model = model.deploymentName;
  else body.model = model.modelName;
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens != null) body.max_tokens = req.maxTokens;

  const url = buildFoundryUrl(endpoint, model);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": apiKey,
    "Authorization": `Bearer ${apiKey}`,
  };

  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const requestId = resp.headers.get("x-request-id") || resp.headers.get("apim-request-id");

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const duration = Date.now() - start;
      const errorClass = classifyError(resp.status, errText);
      const callId = await recordCall(model, req, {
        durationMs: duration,
        status: "error",
        errorClass,
        errorCode: String(resp.status),
        errorMessage: errText.slice(0, 500),
        requestId,
      });
      return {
        content: "",
        inputTokens: 0,
        outputTokens: 0,
        durationMs: duration,
        ttftMs: 0,
        tokensPerSec: 0,
        requestId,
        status: "error",
        errorClass,
        errorMessage: errText.slice(0, 500),
        callId,
      };
    }

    if (stream && resp.body) {
      return await handleStreamingResponse(resp, model, req, start, requestId);
    }

    const data: any = await resp.json();
    const ttft = Date.now() - start;
    const duration = Date.now() - start;
    const inputTokens = data?.usage?.prompt_tokens ?? 0;
    const outputTokens = data?.usage?.completion_tokens ?? 0;
    const cachedInputTokens = data?.usage?.prompt_tokens_details?.cached_tokens ?? null;
    const tokensPerSec = duration > 0 && outputTokens > 0 ? (outputTokens / (duration / 1000)) : 0;
    const content = data?.choices?.[0]?.message?.content ?? "";
    const costCents = computeCostCents(model, inputTokens, outputTokens);

    const callId = await recordCall(model, req, {
      durationMs: duration,
      ttftMs: ttft,
      tokensPerSec,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      costCents,
      status: "success",
      requestId,
    });

    return {
      content,
      inputTokens,
      outputTokens,
      durationMs: duration,
      ttftMs: ttft,
      tokensPerSec,
      requestId,
      status: "success",
      callId,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    const errorClass = classifyError(undefined, err?.message || "");
    const callId = await recordCall(model, req, {
      durationMs: duration,
      status: "error",
      errorClass,
      errorMessage: String(err?.message || err).slice(0, 500),
    });
    return {
      content: "",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: duration,
      ttftMs: 0,
      tokensPerSec: 0,
      requestId: null,
      status: "error",
      errorClass,
      errorMessage: String(err?.message || err),
      callId,
    };
  }
}

function buildFoundryUrl(endpoint: string, model: LlmModel): string {
  const base = endpoint.replace(/\/+$/, "");
  if (base.includes("/chat/completions") || base.includes("/responses")) return base;
  const deployment = model.deploymentName || model.modelName;
  const apiVersion = model.apiVersion || "2024-10-21";
  if (base.includes("azure.com") || base.includes("inference.ai.azure.com") || base.includes("cognitiveservices.azure.com")) {
    return `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  }
  return `${base}/chat/completions`;
}

async function handleStreamingResponse(
  resp: Response,
  model: LlmModel,
  req: FoundryChatRequest,
  start: number,
  requestId: string | null,
): Promise<FoundryChatResult> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let ttftMs: number | null = null;
  let buffer = "";
  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttftMs == null) ttftMs = Date.now() - start;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") content += delta;
        if (chunk?.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
        }
      } catch {
        // tolerate non-JSON keep-alive lines
      }
    }
  }

  const duration = Date.now() - start;
  const effectiveTtft = ttftMs ?? duration;
  const postTtftMs = Math.max(1, duration - effectiveTtft);
  const tokensPerSec = outputTokens > 0 ? outputTokens / (postTtftMs / 1000) : 0;
  const costCents = computeCostCents(model, inputTokens, outputTokens);

  const callId = await recordCall(model, req, {
    durationMs: duration,
    ttftMs: effectiveTtft,
    tokensPerSec,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costCents,
    status: "success",
    requestId,
  });

  return {
    content,
    inputTokens,
    outputTokens,
    durationMs: duration,
    ttftMs: effectiveTtft,
    tokensPerSec,
    requestId,
    status: "success",
    callId,
  };
}
