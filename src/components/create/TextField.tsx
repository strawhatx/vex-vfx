'use client';

// A text input the browser owns: it starts from the studio's value and reports every change, but
// React never writes the value back while you type. (Bound as a controlled input to the external
// studio store, a burst of store updates while the preview redraws could restore a stale value and
// eat a keystroke.)
import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value: string;
  onValue: (v: string) => void;
};

export function TextField({ value, onValue, ...rest }: Props) {
  return <input {...rest} defaultValue={value} onChange={e => onValue(e.target.value)} />;
}
