'use client';

// Step 4's edit list: the hook and each scene's caption, editable, and the scenes in order.
import type { Plan } from '@/domain/promo/plan';
import { LIMITS } from '@/domain/promo/plan';
import { MOVES } from '@/domain/promo/moves';

interface Props {
  plan: Plan;
  thumbs: (shot: number) => string | undefined;
  onHook: (text: string) => void;
  onCaption: (i: number, text: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
}

export function PlanEditor({ plan, thumbs, onHook, onCaption, onMove, onRemove }: Props) {
  return (
    <div className="plan">
      <label className="field-block">
        <span>Hook</span>
        <input
          defaultValue={plan.hook.text}
          key={`hook-${plan.hook.text}`}
          maxLength={LIMITS.hookText}
          onBlur={e => onHook(e.target.value)}
        />
      </label>
      <ol className="scenes">
        {plan.scenes.map((s, i) => (
          <li key={`${i}-${s.shot}-${s.move}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img src={thumbs(s.shot)} alt="" />
            <div className="scene-body">
              <span className="label">
                Scene {i + 1} · {MOVES[s.move].label} · {s.duration.toFixed(1)}s
              </span>
              <input
                aria-label={`Caption for scene ${i + 1}`}
                defaultValue={s.caption?.text ?? ''}
                key={`cap-${i}-${s.caption?.text}`}
                maxLength={LIMITS.caption}
                placeholder="No caption"
                onBlur={e => onCaption(i, e.target.value)}
              />
            </div>
            <div className="shot-actions">
              <button
                type="button"
                onClick={() => onMove(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move scene ${i + 1} earlier`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(i, i + 1)}
                disabled={i === plan.scenes.length - 1}
                aria-label={`Move scene ${i + 1} later`}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={plan.scenes.length <= LIMITS.scenes[0]}
                aria-label={`Remove scene ${i + 1}`}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
