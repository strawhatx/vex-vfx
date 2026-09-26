const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_HEADERS = ["Timestamp", "Email", "Source"];
const ALLOWED_SOURCES = new Set(["waitlist", "hero", "footer"]);

function waitlistHeaders() {
  const fromEnv = (process.env.WAITLIST_HEADERS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_HEADERS;
}

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") || "";
    body = type.includes("application/json") ? await req.json() : Object.fromEntries(await req.formData());
  } catch {
    return fail(400, "Invalid request.");
  }
  body ??= {};

  // Honeypot: bots fill the hidden "website" field. Pretend it worked.
  if (body.website) return Response.json({ ok: true });

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return fail(400, "Enter a valid email address.");
  }

  const source = ALLOWED_SOURCES.has(String(body.source || "")) ? String(body.source) : "waitlist";
  const timestamp = new Date().toISOString();

  const error = await saveToSheet({ email, source, timestamp });
  if (!error) return Response.json({ ok: true });

  console.error("[waitlist]", error);
  // The sheet failed, but if the signup reached the alert inbox it isn't lost.
  if (await sendFailureAlert({ email, source, timestamp, error })) return Response.json({ ok: true });
  return fail(502, "Could not save that address. Try again in a moment.");
}

/** Appends a row via the Apps Script webhook. Returns an error message, or null on success. */
async function saveToSheet(row: { email: string; source: string; timestamp: string }) {
  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhook) return "GOOGLE_SHEETS_WEBHOOK_URL is not set";

  const payload = {
    email: row.email,
    project: (process.env.WAITLIST_PROJECT || "flarecut").trim(),
    source: row.source,
    headers: waitlistHeaders(),
    values: { Timestamp: row.timestamp, Email: row.email, Source: row.source },
    ...(process.env.WAITLIST_SECRET ? { secret: process.env.WAITLIST_SECRET } : {}),
  };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      // text/plain avoids a CORS preflight that Apps Script can't answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    // Apps Script runs doPost, then 302s to googleusercontent.com where its JSON reply lives.
    const status = response.status;
    if (status === 401 || status === 403) {
      return `Google blocked the webhook (${status}). Redeploy the Apps Script web app with Execute as: Me, Who has access: Anyone, and use the new /exec URL.`;
    }
    const reply = await response.json().catch(() => null);
    if (!response.ok || !reply?.ok) return `Sheets webhook failed: HTTP ${status} ${JSON.stringify(reply)}`;
  } catch (err) {
    return `Sheets webhook unreachable: ${err}`;
  }
  return null;
}

/** Emails the signup to WAITLIST_ALERT_EMAIL through Resend. Returns true if it was sent. */
async function sendFailureAlert(info: { email: string; source: string; timestamp: string; error: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.WAITLIST_ALERT_EMAIL;
  if (!apiKey || !to) {
    console.error("[waitlist] RESEND_API_KEY or WAITLIST_ALERT_EMAIL is not set; failure alert not sent");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.WAITLIST_ALERT_FROM || "Flarecut Waitlist <onboarding@resend.dev>",
        to,
        subject: "Submission failed",
        text: [
          "A waitlist signup could not be saved to Google Sheets. Add it by hand:",
          "",
          `Email: ${info.email}`,
          `Source: ${info.source}`,
          `Time: ${info.timestamp}`,
          "",
          `Error: ${info.error}`,
        ].join("\n"),
      }),
    });
    if (!response.ok) {
      console.error("[waitlist] failure alert not sent", response.status, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[waitlist] failure alert not sent", err);
    return false;
  }
}
