import nodemailer, { type Transporter } from "nodemailer";

export interface EmailDeliveryResult {
  delivered: boolean;
  recipientCount: number;
  message: string;
}

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host) return null;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cachedTransport;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export async function sendDigestEmail(args: {
  recipients: string[];
  subject: string;
  html: string;
  pdfAttachment?: { filename: string; content: Buffer };
}): Promise<EmailDeliveryResult> {
  const recipients = args.recipients.filter(r => r && r.includes("@"));
  if (recipients.length === 0) {
    return { delivered: false, recipientCount: 0, message: "No valid recipients" };
  }

  const transport = getTransport();
  if (!transport) {
    console.warn(`[Digests] SMTP not configured (set SMTP_HOST); skipping send to ${recipients.length} recipient(s): ${args.subject}`);
    return {
      delivered: false,
      recipientCount: 0,
      message: "SMTP not configured (no SMTP_HOST set)",
    };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@reveille.local";
  try {
    await transport.sendMail({
      from,
      to: recipients.join(","),
      subject: args.subject,
      html: args.html,
      attachments: args.pdfAttachment ? [{ filename: args.pdfAttachment.filename, content: args.pdfAttachment.content }] : [],
    });
    return { delivered: true, recipientCount: recipients.length, message: "ok" };
  } catch (err) {
    console.error("[Digests] SMTP send failed:", err);
    return { delivered: false, recipientCount: 0, message: errorMessage(err) };
  }
}

export interface TeamsDeliveryResult {
  delivered: boolean;
  message: string;
}

const ALLOWED_TEAMS_HOST_PATTERNS: RegExp[] = [
  /^[a-z0-9.-]+\.webhook\.office\.com$/i,
  /^[a-z0-9.-]+\.webhook\.office365\.us$/i,
  /^[a-z0-9.-]+\.logic\.azure\.com$/i,
  /^outlook\.office\.com$/i,
  /^outlook\.office365\.com$/i,
];

export function validateTeamsWebhookUrl(url: string | null | undefined): { ok: boolean; error?: string } {
  if (!url) return { ok: true };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Webhook URL must use HTTPS" };
  }
  if (!ALLOWED_TEAMS_HOST_PATTERNS.some(re => re.test(parsed.hostname))) {
    return {
      ok: false,
      error: `Webhook host '${parsed.hostname}' is not a recognized Microsoft Teams endpoint`,
    };
  }
  return { ok: true };
}

export type AdaptiveCardPayload = {
  type: "message";
  attachments: Array<{
    contentType: string;
    content: Record<string, unknown>;
  }>;
};

export async function sendTeamsAdaptiveCard(webhookUrl: string, payload: AdaptiveCardPayload): Promise<TeamsDeliveryResult> {
  const validation = validateTeamsWebhookUrl(webhookUrl);
  if (!validation.ok) {
    return { delivered: false, message: validation.error || "Invalid webhook URL" };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { delivered: false, message: `Webhook failed: ${res.status} ${text.slice(0, 200)}` };
    }
    return { delivered: true, message: "ok" };
  } catch (err) {
    return { delivered: false, message: errorMessage(err) };
  }
}
