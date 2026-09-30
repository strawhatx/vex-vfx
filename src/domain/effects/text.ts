// Text effects: words on the video, in the palette's colors.
//   - behind: big words set behind the tracked person or object (it stays in front of them), like
//     a magazine cover; fixed in the scene where it was tapped
//   - follow: a label with an arrow, stuck above the object as it moves
//   - title: words that slam onto the screen where it was tapped
// Impact words (POW, BOOM…) are impacts: see impacts.ts.
export type TextStyle = 'behind' | 'follow' | 'title';
export type FontId = 'anton' | 'bebas' | 'bangers' | 'inter';

export const TEXT_STYLES: { id: TextStyle; label: string; words: string }[] = [
  { id: 'behind', label: 'Behind', words: 'LEGEND' },
  { id: 'follow', label: 'Follow', words: 'THE GOAT' },
  { id: 'title', label: 'Title', words: 'GAME ON' },
];

// all under the SIL Open Font License, so free to ship in the app
export const FONTS: { id: FontId; label: string }[] = [
  { id: 'anton', label: 'Anton' },
  { id: 'bebas', label: 'Bebas' },
  { id: 'bangers', label: 'Bangers' },
  { id: 'inter', label: 'Inter' },
];

export const MAX_TEXT = 40;
