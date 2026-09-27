// The timeline's sizes. Times are laid out at `pps` pixels per second.

export const BASE_PPS = 64; // at the start
export const MIN_PPS = 12; // zoomed out
export const MAX_PPS = 480; // zoomed in
export const THUMB_H = 56; // filmstrip tile height
export const PAD = 16; // margin before 0:00

// what gesture handlers need to turn times into pixels and back
export interface Scale {
  pps: number;
  x(t: number): number; // time → px from 0:00
}
