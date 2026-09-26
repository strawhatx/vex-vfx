export function safeInternalPath(value: unknown, fallback = "/") {
  const raw = String(value || fallback).trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback;
  return raw.split("?")[0] || fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_HEADERS = ["Timestamp", "Email", "Source"];
const ALLOWED_SOURCES = new Set(["waitlist", "footer", "post_export"]);

function waitlistHeaders() {
  const fromEnv = (process.env.WAITLIST_HEADERS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HEADERS;
}

export async function submitWaitlistEmail(input: {
  email: string;
  website?: string;
  source?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (input.website) return { ok: true };

  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return { ok: false, status: 503, error: "Waitlist is not connected yet." };
  }

  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  const source = ALLOWED_SOURCES.has(String(input.source || ""))
    ? String(input.source)
    : "waitlist";

  const project = (process.env.WAITLIST_PROJECT || "Scrixo").trim();
  const headers = waitlistHeaders();
  const payload: {
    email: string;
    project: string;
    source: string;
    secret?: string;
    headers: string[];
    values: Record<string, string>;
  } = {
    email,
    project,
    source,
    headers,
    values: {
      Timestamp: new Date().toISOString(),
      Email: email,
      Source: source,
    },
  };
  if (process.env.WAITLIST_SECRET) {
    payload.secret = process.env.WAITLIST_SECRET;
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "User-Agent": "scrixo-waitlist",
      },
      body: JSON.stringify(payload),
      redirect: "manual",
    });

    const status = response.status;
    const redirected = status === 0 || (status >= 300 && status < 400) || status === 405;
    if (!response.ok && !redirected) {
      console.error("[waitlist] sheets webhook failed", status);
      const error =
        status === 401
          ? "Google blocked the waitlist webhook (401). Redeploy the Apps Script web app: Execute as Me, Who has access = Anyone, then paste the new /exec URL into GOOGLE_SHEETS_WEBHOOK_URL."
          : "Could not save that address. Try again in a moment.";
      return { ok: false, status: 502, error };
    }
  } catch (err) {
    console.error("[waitlist] sheets webhook unreachable", err);
    return { ok: false, status: 502, error: "Could not reach the waitlist sheet." };
  }

  return { ok: true };
}
