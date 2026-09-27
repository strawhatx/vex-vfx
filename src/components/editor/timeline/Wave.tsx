// A waveform: levels (0..1) spread evenly across its box, drawn mirrored around the middle.

export function Wave({ levels, className }: { levels: number[]; className: string }) {
  const n = Math.max(1, levels.length);
  const at = (k: number, v: number, dir: number) =>
    `${k + 0.5},${(0.5 + dir * Math.max(0.02, v) * 0.48).toFixed(3)}`;
  const top = levels.map((v, k) => at(k, v, -1));
  const bottom = levels.map((v, k) => at(k, v, 1)).reverse();
  return (
    <svg className={className} viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={[...top, ...bottom].join(' ')} />
    </svg>
  );
}
