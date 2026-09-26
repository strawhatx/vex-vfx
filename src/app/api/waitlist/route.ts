import { NextResponse } from "next/server";
import { submitWaitlistEmail } from "@/lib/waitlist";

export async function POST(request: Request) {
  let body: { email?: string; website?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await submitWaitlistEmail({
    email: String(body.email || ""),
    website: body.website,
    source: body.source,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
