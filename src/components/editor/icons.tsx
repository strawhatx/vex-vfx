// Line icons for the editor, drawn on a 24px grid.
export const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const I = {
  plus: 'M12 5v14M5 12h14',
  effects: 'M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z',
  color: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  adjust: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  outline: 'M5 5h4M15 5h4M5 19h4M15 19h4M5 5v4M19 5v4M5 15v4M19 15v4',
  target: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 5l-7 7 7 7',
  edit: 'M8.5 8.5 20 20M8.5 15.5 20 4M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  camera: 'M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM12 9.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  start: 'M6 4v16M10 12h10M14 8l-4 4 4 4',
  end: 'M18 4v16M4 12h10M10 8l4 4-4 4',
  unfix: 'M12 3l7 9-7 9-7-9zM4 4l16 16',
  cross: 'M7 4v3a5 5 0 0 0 10 0V4M7 20v-3a5 5 0 0 1 10 0v3M4 12h3M17 12h3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
};
