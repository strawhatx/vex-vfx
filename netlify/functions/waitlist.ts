import type { Config } from "@netlify/functions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_HEADERS = ["Timestamp", "Email", "Source"];
const ALLOWED_SOURCES = new Set(["waitlist", "hero", "footer"]);

type Result = { ok: true } | { ok: false; status: number; error: string };

function waitlistHeaders() {
  const fromEnv = (process.env.WAITLIST_HEADERS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HEADERS;
}

async function submitWaitlistEmail(input: {
  email?: unknown;
  website?: unknown;
  source?: unknown;
}): Promise<Result> {
  // Honeypot: bots fill the hidden "website" field. Pretend it worked.
  if (input.website) return { ok: true };

  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhook) {
    return { ok: false, status: 503, error: "Waitlist is not connected yet." };
  }

  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  const source = ALLOWED_SOURCES.has(String(input.source || ""))
    ? String(input.source)
    : "waitlist";

  const project = (process.env.WAITLIST_PROJECT || "flarecut").trim();
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
        "User-Agent": "flarecut-waitlist",
      },
      body: JSON.stringify(payload),
      redirect: "manual",
    });

    // Apps Script answers a successful POST with a 302 to googleusercontent.com.
    const status = response.status;
    const redirected = status === 0 || (status >= 300 && status < 400) || status === 405;
    if (!response.ok && !redirected) {
      if (status === 401) {
        console.error(
          "[waitlist] Google blocked the webhook (401). Redeploy the Apps Script web app: Execute as Me, Who has access = Anyone, then set the new /exec URL as GOOGLE_SHEETS_WEBHOOK_URL.",
        );
      } else {
        console.error("[waitlist] sheets webhook failed", status);
      }
      return { ok: false, status: 502, error: "Could not save that address. Try again in a moment." };
    }
  } catch (err) {
    console.error("[waitlist] sheets webhook unreachable", err);
    return { ok: false, status: 502, error: "Could not reach the waitlist. Try again in a moment." };
  }

  return { ok: true };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }

  let body: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") || "";
    body = type.includes("application/json")
      ? await req.json()
      : Object.fromEntries(await req.formData());
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await submitWaitlistEmail(body ?? {});
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, error: result.error }, { status: result.status });
};

export const config: Config = {
  path: "/api/waitlist",
};
