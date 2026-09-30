// The roto screen: where a cutout's outline is checked and fixed, frame by frame, before it's cut
// out. It's laid out like the editor, with its own top bar (undo, what's being cut out, Done), the
// playback bar, and a dock of its own: the whole video with the stretch it's cut from in place of
// the timeline, the toolbar, and tool panels. On the preview, everything outside the outline is
// dimmed, so what's taken in is plain to see. With Add, a tap on a piece (or a loop drawn round it)
// adds it to the outline in every frame; with Remove, it's taken out (see domain/project/parts.ts).
// What's there already stays. Where the piece is the same colour as what's behind it, the Pen
// places a shape's points one tap at a time, for exact control. Edge sets how its edge is feathered,
// smoothed, grown and steadied; dragging the ends of its timeline trims it. Done cuts it out and
// goes back to the editor.
// On a keyboard, ← and → step a frame (with Shift: to the next frame to check), + and − pick
// what taps do, P picks the pen, H the hand, and with the pen Enter closes the shape, Backspace
// takes a point back and Esc drops it.
import { useEffect, useRef, useState } from 'react';
import type { EdgeSettings } from '@/domain/project/edge';
import type { PartOp } from '@/domain/project/parts';
import type { Flag } from '@/domain/project/review';
import { Icon, I } from '../icons';
import type { MakeThumbs, ReelUi, ReviewUi } from '../player';
import { Toolbar, rotoTools, type ToolKey } from '../Toolbar';
import { ToolSheet, TOOL_TITLES, type Tool } from '../ToolSheet';
import { DEFAULT_FX } from '@/application/editor';
import { RotoTimeline } from './RotoTimeline';

const WHY: Record<Flag, string> = {
  ok: 'Looks right',
  missing: 'Not found here',
  lost: 'Lost here: the outline is a guess',
  jump: 'The outline changed size here',
};

export interface RotoActions {
  seekFrame(i: number): void;
  seekClip(t: number): void;
  stepFrame(dir: 1 | -1): void;
  seekFlagged(dir: 1 | -1): void;
  setRange(r: { s?: number; e?: number }): void;
  commitRange(): void;
  setTool(tool: PartOp): void;
  togglePen(): void;
  toggleHand(): void;
  penBack(): void;
  penCancel(): void;
  penClose(): void;
  setEdge(p: Partial<EdgeSettings>): void;
  undo(): void;
  redo(): void;
  done(): void;
}

const toCheck = (r: ReviewUi) => r.flags.filter(f => f !== 'ok').length;

export function RotoHeader({
  review,
  job,
  canUndo,
  canRedo,
  on,
}: {
  review: ReviewUi;
  job: { label: string; progress: number } | null; // work in progress (tracking its fixes)
  canUndo: boolean;
  canRedo: boolean;
  on: RotoActions;
}) {
  const n = toCheck(review);
  return (
    <header className="topbar roto-top">
      <div className="top-tools">
        <button type="button" className="icon-btn" aria-label="Undo" disabled={!canUndo} onClick={on.undo}>
          <Icon d={I.undo} />
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" disabled={!canRedo} onClick={on.redo}>
          <Icon d={I.redo} />
        </button>
      </div>
      <div className="roto-title">
        <strong>Cut out {review.name}</strong>
        <span>
          {job
            ? `${job.label}… ${Math.round(job.progress * 100)}%`
            : n
              ? `${n} ${n === 1 ? 'frame' : 'frames'} to check`
              : 'Every frame looks right'}
        </span>
      </div>
      <button type="button" className="export" onClick={on.done}>
        Done
      </button>
    </header>
  );
}

export function RotoDock({
  review,
  reel,
  makeThumbs,
  on,
}: {
  review: ReviewUi;
  reel: ReelUi | undefined;
  makeThumbs: MakeThumbs;
  on: RotoActions;
}) {
  const { s, e, flags, at, tool, pen } = review;
  const k = at >= s && at < e ? at - s : -1;
  // the tool panel open (Edge)
  const [open, setOpen] = useState<Tool | null>(null);

  // on a keyboard: ← and → step a frame (with Shift: to the next frame to check), + and − pick
  // what taps do, P the pen, H the hand, and with the pen's shape begun Enter closes it,
  // Backspace takes a point back and Esc clears it
  const act = useRef(on);
  const penRef = useRef(pen);
  useEffect(() => {
    act.current = on;
    penRef.current = pen;
  });
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest('input, textarea')) return;
      const a = act.current;
      if (ev.key === '+' || ev.key === '=' || ev.key === '-')
        return a.setTool(ev.key === '-' ? 'remove' : 'add');
      if (ev.key === 'p' || ev.key === 'P') return a.togglePen();
      if (ev.key === 'h' || ev.key === 'H') return a.toggleHand();
      const p = penRef.current;
      if (p.on && p.points) {
        const k = { Enter: a.penClose, Backspace: a.penBack, Escape: a.penCancel }[ev.key];
        if (k) {
          ev.preventDefault();
          return k();
        }
      }
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const dir = ev.key === 'ArrowLeft' ? -1 : 1;
      if (ev.shiftKey) a.seekFlagged(dir);
      else a.stepFrame(dir);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  function press(key: ToolKey) {
    switch (key) {
      case 'add':
      case 'remove':
        return on.setTool(key);
      case 'pen':
        return on.togglePen();
      case 'hand':
        return on.toggleHand();
      case 'edge':
        return setOpen(o => (o === 'edge' ? null : 'edge'));
      case 'prevframe':
        return on.stepFrame(-1);
      case 'nextframe':
        return on.stepFrame(1);
      case 'penclose':
        return on.penClose();
      case 'penback':
        return on.penBack();
      case 'penclear':
        return on.penCancel();
    }
  }

  const drawing = pen.on && pen.points > 0;
  return (
    <>
      <div className="roto">
        <RotoTimeline
          review={review}
          reel={reel}
          makeThumbs={makeThumbs}
          on={{ seek: on.seekClip, setRange: on.setRange, commitRange: on.commitRange }}
        />
        <p className="roto-note">
          {k >= 0
            ? `Frame ${k + 1} of ${e - s} · ${WHY[flags[k]]}`
            : 'Not cut out here. Drag the handles to take it in.'}
        </p>
      </div>
      <Toolbar
        label={drawing ? 'Pen' : 'Cutout tools'}
        buttons={rotoTools({ tool, pen, hand: review.hand, open })}
        onPress={press}
        onBack={drawing ? on.penCancel : undefined}
      />
      {open === 'edge' && (
        <ToolSheet
          tool="edge"
          title={TOOL_TITLES.edge}
          fx={DEFAULT_FX}
          onChange={() => {}}
          onClose={() => setOpen(null)}
          edge={review.edge}
          onEdge={on.setEdge}
        />
      )}
    </>
  );
}
