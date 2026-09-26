// Sound effects, made from scratch as samples: no audio files to license or download. Loops for
// the continuous effects, and one hit sound per impact style. Seeded, so each sound is the same
// every time.
import type { ImpactStyle } from '@/domain/effects/impacts';
import type { Effect } from '@/domain/effects/palettes';
import { mulberry32 } from '@/infrastructure/rendering/rng';

export const LOOP_S = 4;

// a one-pole low-pass: keeps what's below roughly a * sampleRate / (2π)
const lowpass = (a: number) => { let y = 0; return (x: number) => (y += a * (x - y)); };

function normalize(out: Float32Array, peak: number) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] / m * 1.3) * peak;
  return out;
}

// short bursts of noise that die away fast: crackles, snaps and zaps
function clicks(out: Float32Array, sr: number, perSecond: number, len: [number, number], amp: [number, number], seed: number, brightness = 0.6) {
  const r = mulberry32(seed);
  for (let at = 0; at < out.length;) {
    at += Math.floor(-Math.log(1 - r()) / perSecond * sr);
    const n = Math.floor((len[0] + r() * (len[1] - len[0])) * sr), a = amp[0] + r() * (amp[1] - amp[0]), lp = lowpass(brightness);
    for (let k = 0; k < n && at + k < out.length; k++) {
      const w = r() * 2 - 1, env = Math.exp(-k / (n / 4));
      out[at + k] += (w - lp(w)) * a * env; // high-passed noise
    }
  }
}

// a seamless few-second loop for a continuous effect
export function effectLoop(effect: Effect, sr: number): Float32Array {
  const n = Math.floor(LOOP_S * sr), out = new Float32Array(n), r = mulberry32(effect.length * 97 + 11);
  if (effect === 'fire') {
    // a low roar, slowly breathing, with crackles
    const lp = lowpass(0.02), lp2 = lowpass(0.004);
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; out[i] = lp(w) * 2.2 + lp2(w) * 3 * (0.8 + 0.2 * Math.sin(2 * Math.PI * i / n * 2)); }
    clicks(out, sr, 38, [0.002, 0.009], [0.2, 0.9], 5);
  } else if (effect === 'lightning') {
    // an electric buzz that stutters on and off, with sharp zaps
    let phase = 0, on = 1, until = 0;
    for (let i = 0; i < n; i++) {
      if (i >= until) { on = r() < 0.7 ? 1 : 0.15; until = i + Math.floor((0.04 + r() * 0.25) * sr); }
      phase = (phase + 100 / sr) % 1;
      out[i] = (phase * 2 - 1) * 0.35 * on + (r() * 2 - 1) * 0.04;
    }
    clicks(out, sr, 9, [0.015, 0.07], [0.6, 1.4], 7, 0.3);
  } else if (effect === 'aura') {
    // a layered hum, gently pulsing, with a faint shimmer (whole cycles, so the loop is seamless)
    const lp = lowpass(0.3);
    for (let i = 0; i < n; i++) {
      const t = i / sr, trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.5 * t);
      const hum = Math.sin(2 * Math.PI * 110 * t) + 0.8 * Math.sin(2 * Math.PI * 110.75 * t) + 0.5 * Math.sin(2 * Math.PI * 165 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t);
      const w = r() * 2 - 1;
      out[i] = hum * 0.25 * trem + (w - lp(w)) * 0.05;
    }
  } else {
    // a sizzle with lots of tiny snaps
    const lp = lowpass(0.5);
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; out[i] = (w - lp(w)) * 0.12; }
    clicks(out, sr, 70, [0.001, 0.004], [0.3, 1], 9, 0.8);
  }
  // blend the end into the start so the loop point doesn't click
  const fade = Math.floor(0.05 * sr);
  for (let k = 0; k < fade; k++) { const w = k / fade; out[n - fade + k] = out[n - fade + k] * (1 - w) + out[k] * w; }
  return normalize(out, 0.5);
}

// how each hit sounds: thump (a falling low tone), crack (a snap of noise), rumble, shimmer
const HITS: Record<ImpactStyle, { len: number; thump: number; thumpDecay: number; crack: number; rumble: number; shing: number; from: number; to: number }> = {
  punch: { len: 0.5, thump: 0.9, thumpDecay: 0.1, crack: 0.8, rumble: 0, shing: 0, from: 160, to: 55 },
  slam: { len: 1.3, thump: 1, thumpDecay: 0.3, crack: 0.6, rumble: 0.6, shing: 0, from: 120, to: 38 },
  blast: { len: 1.6, thump: 0.9, thumpDecay: 0.45, crack: 0.4, rumble: 0.5, shing: 0.2, from: 140, to: 42 },
  anime: { len: 1.0, thump: 0.7, thumpDecay: 0.14, crack: 1, rumble: 0, shing: 0.35, from: 180, to: 60 },
};

// one hit; speed below 1 (a stretched, slowed-down impact) makes it longer and deeper
export function impactHit(style: ImpactStyle, speed: number, sr: number): Float32Array {
  const h = HITS[style], stretch = 1 / Math.max(0.125, Math.min(4, speed)), pitch = Math.max(0.5, Math.min(1.6, speed ** 0.35));
  const n = Math.floor(h.len * stretch * sr), out = new Float32Array(n), r = mulberry32(style.length * 131 + 3);
  const lpCrack = lowpass(0.5), lpRumble = lowpass(0.015);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, ts = t / stretch;
    const f = (h.to + (h.from - h.to) * Math.exp(-ts / 0.06)) * pitch;
    ph += 2 * Math.PI * f / sr;
    let v = Math.sin(ph) * h.thump * Math.exp(-ts / h.thumpDecay);
    const w = r() * 2 - 1;
    v += (w - lpCrack(w)) * h.crack * Math.exp(-ts / 0.025);
    if (h.rumble) v += lpRumble(w) * 6 * h.rumble * Math.exp(-ts / 0.45);
    if (h.shing) { ph2 += 2 * Math.PI * (900 + 1500 * Math.exp(-ts / 0.08)) * pitch / sr; v += Math.sin(ph2) * h.shing * Math.exp(-ts / 0.3); }
    // a quick fade-in, so the start doesn't click
    out[i] = v * Math.min(1, i / (0.002 * sr));
  }
  return normalize(out, 0.9);
}
