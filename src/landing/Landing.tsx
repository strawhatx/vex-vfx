"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACCENT, startEffects, type FxName } from "./effects";

const HERO_FX: { fx: FxName; label: string }[] = [
  { fx: "fire", label: "Fire" },
  { fx: "lightning", label: "Lightning" },
  { fx: "aura", label: "Aura" },
];

const CARDS: { fx: FxName; title: string; soon?: boolean }[] = [
  { fx: "fire", title: "Fire" },
  { fx: "lightning", title: "Lightning" },
  { fx: "aura", title: "Aura" },
  { fx: "sparks", title: "Sparks" },
  { fx: "neon", title: "Neon outline", soon: true },
  { fx: "trail", title: "Motion trail", soon: true },
];

const MARQUEE = ["Fire", "Lightning", "Aura", "Sparks", "Neon", "Trails", "One tap", "No After Effects"];
const NOTE = "Free to start. One email when it opens. No spam.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Landing() {
  const heroRef = useRef<HTMLElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof startEffects> | null>(null);
  const [effect, setEffect] = useState<FxName>("fire");

  useEffect(() => {
    const cards = [...cardsRef.current!.querySelectorAll<HTMLCanvasElement>("canvas[data-card]")];
    const fx = startEffects(heroRef.current!, fxRef.current!, cards);
    engine.current = fx;
    return () => {
      fx.stop();
      engine.current = null;
    };
  }, []);

  function pick(fx: FxName) {
    setEffect(fx);
    engine.current?.setEffect(fx);
    document.documentElement.style.setProperty("--accent", ACCENT[fx]);
  }

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="logo" href="#top">
            Flare<b>cut</b>
          </a>
          <a className="pill" href="#join">
            Join the waitlist
          </a>
        </div>
      </nav>

      <header className="hero" id="top" ref={heroRef}>
        <canvas id="fx" ref={fxRef} aria-hidden="true" />
        <span className="hint">Move your cursor · it follows you</span>
        <div className="wrap hero-inner">
          <h1>
            <span>Put fire</span>
            <span className="outline">on anything.</span>
          </h1>
          <div className="hero-row">
            <p>
              Tap a hand, a body, a car. Pick an effect. It tracks the whole clip for you. No keyframes. No
              masking. No After Effects.
            </p>
            <div className="switch" role="group" aria-label="Try an effect">
              {HERO_FX.map(({ fx, label }) => (
                <button key={fx} type="button" aria-pressed={effect === fx} onClick={() => pick(fx)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div>
          {[0, 1].flatMap((n) =>
            MARQUEE.map((word) => (
              <span key={`${n}-${word}`}>
                {word}
                <i>✦</i>
              </span>
            )),
          )}
        </div>
      </div>

      <section className="block" id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>
            Raw clip to VFX shot.
            <br />
            Three taps.
          </h2>
          <ol className="steps">
            <li>
              <span className="n">01</span>
              <h3>Upload a clip</h3>
              <p>Any short video from your phone. Punches, dances, trick shots, anything with a subject you can point at.</p>
            </li>
            <li>
              <span className="n">02</span>
              <h3>Tap what should burn</h3>
              <p>
                Tap a hand, a person or an object. Flarecut traces its outline and follows it through every frame, even
                as it moves and turns.
              </p>
            </li>
            <li>
              <span className="n">03</span>
              <h3>Pick it. Post it.</h3>
              <p>Choose an effect, dial in color, size and intensity, and export a clip that&apos;s ready for TikTok and Reels.</p>
            </li>
          </ol>

          <div className="versus">
            <div className="old">
              <span className="tag">The old way</span>
              <ol>
                <li><s>Place motion trackers by hand</s></li>
                <li><s>Link tracking to an invisible layer</s></li>
                <li><s>Build the effect in a plugin</s></li>
                <li><s>Mask everything that passes in front</s></li>
                <li><s>Tweak until it blends</s></li>
              </ol>
              <p className="foot">30 minutes to hours. Per shot.</p>
            </div>
            <div className="new">
              <span className="tag">Flarecut</span>
              <ol>
                <li>Tap.</li>
                <li>Pick.</li>
                <li>Post.</li>
              </ol>
              <p className="foot">Built to take seconds.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id="effects" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <p className="eyebrow">Effects</p>
          <h2>They stick to the action.</h2>
          <div className="fx-grid" ref={cardsRef}>
            {CARDS.map(({ fx, title, soon }) => (
              <div key={fx} className={soon ? "fx-card soon" : "fx-card"}>
                <canvas data-card={fx} />
                <h3>{title}</h3>
                <span>{soon ? "Coming later" : "At launch"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 0 }}>
        <div className="wrap story">
          <h2>
            Built in public.
            <br />
            By someone who hates 3-hour edits.
          </h2>
          <div>
            <p>
              I love VFX videos but hate how long they take, so I&apos;m building the tool I wanted. Follow along for
              the wins, the fails, and the first time the fire actually tracks a fist.
            </p>
            <a className="pill" href="https://www.tiktok.com/@YOUR_HANDLE">
              Follow @YOUR_HANDLE on TikTok
            </a>
          </div>
        </div>
      </section>

      <section className="join" id="join">
        <div className="wrap">
          <p className="eyebrow">Early access</p>
          <h2>
            Set your videos
            <br />
            on fire first.
          </h2>
          <WaitlistForm />
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>© 2026 Flarecut</span>
          <a href="https://x.com/heynathanielj" target="_blank" rel="noopener noreferrer">
            @heynathanielj on X
          </a>
        </div>
      </footer>
    </>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [note, setNote] = useState({ text: NOTE, err: false });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setNote({ text: "Enter a valid email address.", err: true });
      return;
    }
    // Google Sheets takes several seconds to answer, so show success right away
    // and bring the form back only if the save fails.
    setDone(true);
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, website, source: "waitlist" }),
        keepalive: true,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn’t save that. Try again in a moment.");
    } catch (err) {
      setDone(false);
      setNote({ text: (err as Error).message || "Couldn’t save that. Try again in a moment.", err: true });
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <p className="done" aria-live="polite">
        You&apos;re on the list. 🔥
      </p>
    );
  }

  return (
    <>
      <form onSubmit={submit} noValidate>
        <p className="hidden" aria-hidden="true">
          <label>
            Leave this empty{" "}
            <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </p>
        <label className="sr" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNote({ text: NOTE, err: false });
          }}
        />
        <button type="submit" disabled={saving}>
          Get early access
        </button>
      </form>
      <p className={note.err ? "note err" : "note"} aria-live="polite">
        {note.text}
      </p>
    </>
  );
}
