// The home page's questions and answers (also its FAQPage structured data).
export const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: 'Is PromoReel really free?',
    a: 'Yes. Making and downloading videos is free, with no watermark beyond a small “Made with PromoReel” line on the end card. The only paid part is AI, and that’s your own: paste the prompt into your Claude, ChatGPT or Gemini subscription, use your own API key, or skip AI entirely.',
  },
  {
    q: 'Do my screenshots get uploaded?',
    a: 'No. Your screenshots are decoded, animated and encoded into an MP4 inside your browser. They never reach our servers. If you choose to direct with your own Anthropic API key, the browser sends them straight to Anthropic, and nowhere else.',
  },
  {
    q: 'What does the AI do?',
    a: 'It watches your screenshots like a director: it picks the order, the move for each scene, where to zoom, the hook and the captions, and returns a plan as JSON. PromoReel checks the plan and renders it. You can edit every caption and reorder scenes.',
  },
  {
    q: 'What sizes can I export?',
    a: '9:16 vertical (1080×1920) for TikTok, Reels, Shorts and X, or 16:9 (1920×1080) for Product Hunt, YouTube and landing pages. Videos are H.264 MP4s, 10–45 seconds long.',
  },
  {
    q: 'Which browsers work?',
    a: 'A recent Chrome, Edge, Safari or Firefox. Export uses WebCodecs, which these browsers support. Previewing works on phones; exporting is faster on a desktop.',
  },
  {
    q: 'Why do you ask for my email?',
    a: 'To send you occasional updates when new aesthetics and moves ship. One click unsubscribes. Your email goes to our newsletter service and nowhere else.',
  },
];
