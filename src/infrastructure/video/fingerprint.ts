// A video file's fingerprint: the same file gives the same one, so its uses in a film can share
// what's traced in it (see Project.identify). It's a SHA-256 of the file's size and three pieces of
// it (its start, middle and end), so even a long video is fingerprinted at once, without reading
// all of it into memory.
const PIECE = 2 * 1024 * 1024;

export async function fingerprint(file: Blob): Promise<string> {
  const n = file.size;
  const starts = n <= PIECE * 3 ? [0] : [0, Math.floor(n / 2 - PIECE / 2), n - PIECE];
  const pieces = starts.map(s => file.slice(s, n <= PIECE * 3 ? n : s + PIECE));
  const size = new TextEncoder().encode(`${n}:`);
  const data = await new Blob([size, ...pieces]).arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
}
