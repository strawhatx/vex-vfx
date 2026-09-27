// The timeline: a ruler, the clip's filmstrip, and the effects and impacts as bars covering the
// stretch each one lasts, stacked in rows where they overlap; the clip's own sound and each
// effect's sound are drawn as waveforms. It starts at the left; the playhead moves across as the
// video plays, and the timeline scrolls along to keep it in view. Tap or drag the ruler (or the
// playhead's handle) to scrub; scrolling just scrolls. Pinch (or Ctrl/⌘ + scroll) zooms it, keeping
// the playhead where it is on screen.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { IMPACTS } from '@/domain/effects/impacts';
import type { Lane, UiState } from './player';
import { makeFilmstrip } from './filmstrip';
import { Icon, I } from './icons';
import { effectName } from './ToolSheet';

// pixels per second: at the start, and how far it zooms; filmstrip tile height; the margin before 0:00
const BASE_PPS = 64, MIN_PPS = 12, MAX_PPS = 480, THUMB_H = 56, PAD = 16;
// ruler label spacing, in seconds: the smallest that keeps labels this far apart
const LABEL_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120], LABEL_GAP = 64;

export const mmss = (t: number) => { t = Math.max(0, t || 0); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
const label = (t: number, step: number) => (step < 1 ? `${mmss(t)}.${Math.round((t % 1) * 10)}` : mmss(t));

// a waveform: levels (0..1) spread evenly across its box, drawn mirrored around the middle
function Wave({ levels, className }: { levels: number[]; className: string }) {
  const n = Math.max(1, levels.length), top = levels.map((v, k) => `${k + 0.5},${(0.5 - Math.max(0.02, v) * 0.48).toFixed(3)}`);
  const bottom = levels.map((v, k) => `${k + 0.5},${(0.5 + Math.max(0.02, v) * 0.48).toFixed(3)}`).reverse();
  return (
    <svg className={className} viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={[...top, ...bottom].join(' ')} />
    </svg>
  );
}

export function Timeline({ ui, clipSelected, busy, currentTime, soundShape, on }: {
  ui: UiState; clipSelected: boolean; busy: boolean;
  soundShape(l: Lane): number[]; // each clip's sound effect, for its waveform
  currentTime(): number; // the clip time being shown, read every frame while playing
  on: {
    seek(t: number): void; deselect(): void; selectClip(): void; selectLane(id: number): void;
    chooseFile(): void; addEffect(): void;
    // live while dragging an effect's end; commit once the drag ends
    setRange(id: number, r: { s?: number; e?: number }): void; commitRange(id: number): void;
    // an impact dragged to hit at time t
    moveImpact(id: number, t: number): void;
  };
}) {
  const dur = ui.duration || 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(BASE_PPS);
  const ppsRef = useRef(pps); // the zoom, for event handlers
  const x = (t: number) => t * pps;
  const [clock, setClock] = useState(0);
  const [strip, setStrip] = useState<{ src: string; urls: string[] } | null>(null);

  // ---------- filmstrip: at most 60 tiles, stretched when zoomed ----------
  const step = dur > 60 ? dur / 60 : 1;
  useEffect(() => {
    const src = ui.src;
    if (!src || !dur) return;
    const ac = new AbortController();
    void makeFilmstrip(src, dur, ui.videoStart, step, step * BASE_PPS, THUMB_H, ac.signal, (i, url) => {
      setStrip(st => { const urls = st?.src === src ? st.urls.slice() : []; urls[i] = url; return { src, urls }; });
    });
    return () => ac.abort();
  }, [ui.src, dur, ui.videoStart, step]);
  const thumbs = strip && strip.src === ui.src ? strip.urls : [];

  // ---------- the playhead ----------
  const shownTime = ui.playing ? clock : ui.time;
  const timeRef = useRef(shownTime);
  useEffect(() => { timeRef.current = shownTime; }, [shownTime]);
  // scrolls just enough to bring the playhead back into view (with a little room to its right)
  const follow = useCallback((t: number, scale: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const px = PAD + t * scale;
    if (px < el.scrollLeft + 8 || px > el.scrollLeft + el.clientWidth - 48) el.scrollLeft = px - el.clientWidth * 0.2;
  }, []);
  // while playing, follow the video every frame (timeupdate is too coarse)
  useEffect(() => {
    if (!ui.playing) return;
    let raf = 0;
    const tick = () => { const t = currentTime(); setClock(t); follow(t, ppsRef.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing, follow, currentTime]);
  useEffect(() => { if (!ui.playing) follow(ui.time, ppsRef.current); }, [ui.time, ui.playing, follow]);

  // scrubbing: tap or drag on the ruler, or drag the playhead's handle
  const scrubbing = useRef(false), pending = useRef<number | null>(null);
  const timeAt = (clientX: number) => {
    const inner = scrollRef.current?.firstElementChild?.getBoundingClientRect();
    return inner ? Math.max(0, Math.min(dur, (clientX - inner.left - PAD) / pps)) : 0;
  };
  const seekSoon = (t: number) => {
    if (pending.current === null) requestAnimationFrame(() => { if (pending.current !== null) on.seek(pending.current); pending.current = null; });
    pending.current = t;
  };
  function scrubDown(e: PointerEvent) {
    if (!ui.ready) return;
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrubbing.current = true;
    seekSoon(timeAt(e.clientX));
  }
  function scrubMove(e: PointerEvent) { if (scrubbing.current) seekSoon(timeAt(e.clientX)); }
  const scrubUp = () => { scrubbing.current = false; };
  const scrubbable = { onPointerDown: scrubDown, onPointerMove: scrubMove, onPointerUp: scrubUp, onPointerCancel: scrubUp, onClick: (e: MouseEvent) => e.stopPropagation() };

  // ---------- zoom: pinch with two fingers, or Ctrl/⌘ + scroll (trackpad pinch) ----------
  // where the playhead sat on screen before a zoom, to put it back there after
  const zoomAnchor = useRef<{ t: number; off: number } | null>(null);
  useLayoutEffect(() => {
    ppsRef.current = pps;
    const el = scrollRef.current, a = zoomAnchor.current;
    if (el && a) el.scrollLeft = PAD + a.t * pps - a.off;
    zoomAnchor.current = null;
  }, [pps]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const clamp = (v: number) => Math.max(MIN_PPS, Math.min(MAX_PPS, v));
    const zoomTo = (next: number) => {
      const t = timeRef.current;
      zoomAnchor.current ??= { t, off: PAD + t * ppsRef.current - el.scrollLeft };
      setPps(clamp(next));
    };
    let pinch: { d: number; pps: number } | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const start = (e: TouchEvent) => { if (e.touches.length === 2) { pinch = { d: dist(e), pps: ppsRef.current }; e.preventDefault(); } };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(pinch.pps * dist(e) / Math.max(1, pinch.d));
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(ppsRef.current * Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); el.removeEventListener('wheel', wheel);
    };
  }, []);

  // ---------- dragging an effect's start or end ----------
  const drag = useRef<{ id: number; end: 's' | 'e'; x: number; t: number } | null>(null);
  function gripDown(e: PointerEvent, l: Lane, end: 's' | 'e') {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, end, x: e.clientX, t: l.range[end] };
  }
  function gripMove(e: PointerEvent) {
    const d = drag.current;
    if (d) on.setRange(d.id, { [d.end]: d.t + (e.clientX - d.x) / pps });
  }
  function gripUp() {
    const d = drag.current;
    drag.current = null;
    if (d) on.commitRange(d.id);
  }
  const grip = (l: Lane, end: 's' | 'e') => (
    <span className={`grip ${end}`} onPointerDown={e => gripDown(e, l, end)} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}
      onClick={e => e.stopPropagation()}
      role="slider" aria-label={`${l.name} ${end === 's' ? 'start' : 'end'}`} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={l.range[end]} />
  );

  // ---------- impacts: tap to select, drag to move the hit ----------
  const [impDrag, setImpDrag] = useState<{ id: number; x: number; from: number; t: number; moved: boolean } | null>(null);
  function impDown(e: PointerEvent, l: Lane) {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setImpDrag({ id: l.id, x: e.clientX, from: l.range.s, t: l.range.s, moved: false });
  }
  function impMove(e: PointerEvent) {
    if (!impDrag) return;
    const dx = e.clientX - impDrag.x;
    if (!impDrag.moved && Math.abs(dx) < 4) return;
    setImpDrag({ ...impDrag, t: Math.max(0, Math.min(dur, impDrag.from + dx / pps)), moved: true });
  }
  function impUp() {
    const d = impDrag;
    setImpDrag(null);
    if (!d) return;
    if (d.moved) on.moveImpact(d.id, d.t);
    if (!d.moved || ui.selected !== d.id) on.selectLane(d.id);
  }

  const stop = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f(); };

  // ruler: labels far enough apart for the zoom, with a dot halfway between
  const every = LABEL_STEPS.find(s => s * pps >= LABEL_GAP) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
  const ticks = [];
  for (let k = 0; k * every / 2 <= dur + 1e-6; k++) {
    const s = k * every / 2, dot = k % 2 === 1;
    ticks.push(<span key={k} className={dot ? 'tick dot' : 'tick'} style={{ left: x(s) }}>{dot ? '' : label(s, every)}</span>);
  }

  const rows = Array.from({ length: ui.rows }, (_, r) => ui.lanes.filter(l => l.row === r));

  return (
    <div className="timeline" onClick={on.deselect}>
      <div ref={scrollRef} className="tl-scroll" aria-label="Timeline. Drag the ruler to scrub, pinch to zoom.">
        <div className="tl-inner" style={{ width: x(dur) }}>
          <div className="ruler" {...scrubbable} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={dur} aria-valuenow={shownTime}>{ticks}</div>

          <div className="tl-row">
            {ui.ready ? (
              <>
                <button type="button" className={`lane clip${clipSelected ? ' sel' : ''}`} style={{ width: x(dur), height: THUMB_H }}
                  aria-pressed={clipSelected} aria-label="Video clip" onClick={stop(on.selectClip)}>
                  {thumbs.map((u, i) => u && (
                    <span key={i} className="thumb" style={{ left: x(i * step), width: x(step), backgroundImage: `url(${u})` }} />
                  ))}
                </button>
                <button type="button" className="add-end" style={{ left: x(dur) }} aria-label="Replace clip" onClick={stop(on.chooseFile)}>
                  <Icon d={I.plus} size={22} />
                </button>
              </>
            ) : (
              <button type="button" className="add-clip" onClick={stop(on.chooseFile)}><Icon d={I.plus} size={18} />Add clip</button>
            )}
          </div>

          {ui.ready && (
            // the clip's own sound
            <div className="tl-row audio-row">
              <button type="button" className={`audio-clip${ui.muted ? ' muted' : ''}${clipSelected ? ' sel' : ''}`} style={{ width: x(dur) }}
                aria-label={ui.wave === 'none' ? 'This clip has no sound' : ui.muted ? 'Clip sound, muted' : 'Clip sound'} onClick={stop(on.selectClip)}>
                {Array.isArray(ui.wave) ? <Wave levels={ui.wave} className="wave" />
                  : <span>{ui.wave === 'none' ? 'No sound in this clip' : ui.wave === 'unreadable' ? 'Clip sound (can’t show its waveform here)' : 'Reading sound…'}</span>}
                {ui.wave !== 'none' && ui.muted && <span className="muted-tag"><Icon d={I.muted} size={12} />Muted</span>}
              </button>
            </div>
          )}

          {rows.map((lanes, r) => (
            <div key={r} className="tl-row fx-row">
              {lanes.map(l => {
                const sel = l.id === ui.selected;
                if (l.kind === 'impact') {
                  // a short clip starting at the hit: tap to select, drag to move; stretch its ends to
                  // slow the burst down, squeeze them to speed it up
                  const dragging = impDrag?.id === l.id, at = dragging ? impDrag.t : l.range.s, w = Math.max(24, x(l.range.e - l.range.s));
                  const speed = Math.abs(l.speed - 1) < 0.01 ? '' : `${l.speed < 1 ? l.speed.toFixed(2).replace(/0$/, '') : l.speed.toFixed(1)}×`;
                  return (
                    <span key={l.id} className={`fx-clip${sel || dragging ? ' on' : ''}`} style={{ left: x(at), width: w, '--c': l.color } as CSSProperties}>
                      <button type="button" className={`impact-clip${sel || dragging ? ' on' : ''}`}
                        aria-pressed={sel} aria-label={`${l.name}: ${IMPACTS[l.impact!].label}${speed ? ` at ${speed} speed` : ''}, hits at ${mmss(l.range.s)}. Tap to select, drag to move.`}
                        onClick={e => e.stopPropagation()} onPointerDown={e => impDown(e, l)} onPointerMove={impMove} onPointerUp={impUp} onPointerCancel={() => setImpDrag(null)}>
                        <Wave levels={soundShape(l)} className="fx-wave" />
                        <Icon d={I.burst} size={14} />
                        {w > 40 && <span>{w > 110 ? IMPACTS[l.impact!].label : ''}{speed && <b>{speed}</b>}</span>}
                      </button>
                      {sel && !dragging && <>{grip(l, 's')}{grip(l, 'e')}</>}
                    </span>
                  );
                }
                const w = x(l.range.e - l.range.s);
                return (
                  <span key={l.id} className={`fx-clip${sel ? ' on' : ''}`} style={{ left: x(l.range.s), width: w, '--c': l.color } as CSSProperties}>
                    <button type="button" className="fx-body" aria-pressed={sel} aria-label={`${l.name}: ${effectName(l.fx.effect)}, ${mmss(l.range.s)} to ${mmss(l.range.e)}`}
                      onClick={stop(() => on.selectLane(l.id))}>
                      {l.spans.map((sp, i) => (
                        <span key={i} className={`span${sp.weak ? ' weak' : ''}`} style={{ left: x(sp.s - l.range.s), width: Math.max(2, x(sp.e - sp.s)) }} />
                      ))}
                      <Wave levels={soundShape(l)} className="fx-wave" />
                      {l.keys.map((k, i) => <i key={i} className="key" style={{ left: x(k - l.range.s) }} />)}
                      <span className="fx-label"><i style={{ background: l.color }} />{w > 110 ? `${l.name} · ${effectName(l.fx.effect)}` : effectName(l.fx.effect)}</span>
                    </button>
                    {sel && <>{grip(l, 's')}{grip(l, 'e')}</>}
                  </span>
                );
              })}
            </div>
          ))}

          {ui.ready && (
            <div className="tl-row add-row">
              <button type="button" className={`add-hint${ui.adding ? ' on' : ''}`} disabled={busy} onClick={stop(on.addEffect)}>
                <Icon d={I.plus} size={16} />{ui.adding ? 'Tap the object in the preview' : 'Add effect'}
              </button>
            </div>
          )}
          {/* the playhead: moves across as the video plays; drag its handle to scrub */}
          <div className="playhead" style={{ left: PAD + x(shownTime) }}>
            <span className="playhead-knob" {...scrubbable} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
