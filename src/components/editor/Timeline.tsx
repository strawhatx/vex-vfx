// The timeline: a ruler, the clip's filmstrip, one lane per tracked object and cut lines through
// them all. The playhead is fixed in the middle and the timeline scrolls under it; scrolling scrubs.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import type { Lane, UiState } from './player';
import { makeFilmstrip } from './filmstrip';
import { Icon, I } from './icons';
import { effectName } from './ToolSheet';

// pixels per second of video, and filmstrip tile height
const PPS = 64, THUMB_H = 56;
const x = (t: number) => t * PPS;

export const mmss = (t: number) => { t = Math.max(0, t || 0); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };

export function Timeline({ ui, clipSelected, busy, currentTime, on }: {
  ui: UiState; clipSelected: boolean; busy: boolean;
  currentTime(): number; // the video's time, read every frame while playing
  on: {
    seek(t: number): void; deselect(): void; selectClip(): void; selectLane(id: number): void;
    chooseFile(): void; addObject(): void; goToShot(id: number, shot: number): void; setRange(id: number, r: { s?: number; e?: number }): void;
  };
}) {
  const dur = ui.duration || 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(0);
  const [strip, setStrip] = useState<{ src: string; urls: string[] } | null>(null);

  // ---------- filmstrip: at most 60 tiles ----------
  const step = dur > 60 ? dur / 60 : 1;
  useEffect(() => {
    const src = ui.src;
    if (!src || !dur) return;
    const ac = new AbortController();
    void makeFilmstrip(src, dur, step, step * PPS, THUMB_H, ac.signal, (i, url) => {
      setStrip(st => { const urls = st?.src === src ? st.urls.slice() : []; urls[i] = url; return { src, urls }; });
    });
    return () => ac.abort();
  }, [ui.src, dur, step]);
  const thumbs = strip && strip.src === ui.src ? strip.urls : [];

  // ---------- timeline <-> playhead ----------
  const lastSet = useRef(-1);
  const pending = useRef<number | null>(null);
  const scrollTo = useCallback((t: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = x(t);
    lastSet.current = el.scrollLeft;
  }, []);
  // while playing, follow the video every frame (timeupdate is too coarse)
  useEffect(() => {
    if (!ui.playing) return;
    let raf = 0;
    const tick = () => { const t = currentTime(); setClock(t); scrollTo(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ui.playing, scrollTo, currentTime]);
  useEffect(() => { if (!ui.playing) scrollTo(ui.time); }, [ui.time, ui.playing, scrollTo]);
  const shownTime = ui.playing ? clock : ui.time;

  function onScroll() {
    const el = scrollRef.current;
    if (!el || Math.abs(el.scrollLeft - lastSet.current) < 1) return; // our own scroll
    lastSet.current = el.scrollLeft;
    const t = Math.min(dur, el.scrollLeft / PPS);
    if (pending.current === null) requestAnimationFrame(() => { if (pending.current !== null) on.seek(pending.current); pending.current = null; });
    pending.current = t;
  }

  // ---------- dragging an effect's start or end handle ----------
  const drag = useRef<{ id: number; end: 's' | 'e'; x: number; t: number } | null>(null);
  function gripDown(e: PointerEvent, l: Lane, end: 's' | 'e') {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, end, x: e.clientX, t: l.range[end] };
  }
  function gripMove(e: PointerEvent) {
    const d = drag.current;
    if (d) on.setRange(d.id, { [d.end]: d.t + (e.clientX - d.x) / PPS });
  }
  const gripUp = () => { drag.current = null; };
  const grip = (l: Lane, end: 's' | 'e') => (
    <span className={`grip ${end}`} onPointerDown={e => gripDown(e, l, end)} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}
      role="slider" aria-label={end === 's' ? 'Effect start' : 'Effect end'} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={l.range[end]} />
  );

  const stop = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f(); };

  // ruler: a label every 2 s, a dot on the odd seconds
  const ticks = [];
  for (let s = 0; s <= Math.floor(dur); s++) ticks.push(
    <span key={s} className={s % 2 ? 'tick dot' : 'tick'} style={{ left: x(s) }}>{s % 2 ? '' : mmss(s)}</span>,
  );

  return (
    <div className="timeline" onClick={on.deselect}>
      <span className="tl-time"><b>{mmss(shownTime)}</b> / {mmss(dur)}</span>
      <div ref={scrollRef} className="tl-scroll" onScroll={onScroll} aria-label="Timeline. Drag to scrub.">
        <div className="tl-inner" style={{ width: x(dur) }}>
          <div className="ruler">{ticks}</div>

          <div className="tl-row">
            {ui.ready ? (
              <>
                <div className="heads">
                  <button type="button" className="head" onClick={stop(on.chooseFile)}><Icon d={I.swap} size={20} />Replace</button>
                </div>
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

          {ui.lanes.map(l => {
            const sel = l.id === ui.selected;
            return (
              <div key={l.id} className="tl-row fx-row">
                <span className="heads"><span className="lane-icon" style={{ color: l.color }}><Icon d={I.effects} size={16} /></span></span>
                <button type="button" className={`lane fx${sel ? ' on' : ''}`} style={{ left: 0, width: x(dur), '--c': l.color } as CSSProperties}
                  aria-pressed={sel} aria-label={`${l.name}: ${effectName(l.fx.effect)}`} onClick={stop(() => on.selectLane(l.id))}>
                  {l.spans.map((sp, i) => (
                    <span key={i} className={`span${sp.weak ? ' weak' : ''}`} style={{ left: x(sp.s), width: Math.max(2, x(sp.e - sp.s)) }} />
                  ))}
                  {/* outside the effect's start and end */}
                  <span className="off" style={{ left: 0, width: x(l.range.s) }} />
                  <span className="off" style={{ left: x(l.range.e), right: 0 }} />
                  {l.keys.map((k, i) => <i key={i} className={`key${k.auto ? ' auto' : ''}`} style={{ left: x(k.t) }} />)}
                  <span className="fx-label" style={{ left: x(l.range.s) + (sel ? 18 : 8) }}><i style={{ background: l.color }} />{l.name} · {effectName(l.fx.effect)}</span>
                </button>
                {l.missing.map(m => (
                  <button key={m.shot} type="button" className="missing" style={{ left: x(m.s), width: Math.max(28, x(m.e - m.s)) }}
                    onClick={stop(() => on.goToShot(l.id, m.shot))}>
                    {x(m.e - m.s) > 96 ? 'Not found · tap to fix' : '?'}
                  </button>
                ))}
                {sel && <span className="range" style={{ left: x(l.range.s), width: x(l.range.e - l.range.s) }}>{grip(l, 's')}{grip(l, 'e')}</span>}
              </div>
            );
          })}

          {ui.ready && (
            <div className="tl-row add-row">
              <button type="button" className={`add-hint${ui.adding ? ' on' : ''}`} disabled={busy} onClick={stop(on.addObject)}>
                <Icon d={I.plus} size={16} />{ui.adding ? 'Tap the object in the preview' : ui.lanes.length ? 'Add object' : 'Add effect: tap an object above'}
              </button>
            </div>
          )}

          {ui.cuts.map(t => <span key={t} className="cut" style={{ left: x(t) }} aria-hidden="true" />)}
        </div>
      </div>
      <div className="playhead" aria-hidden="true" />
    </div>
  );
}
