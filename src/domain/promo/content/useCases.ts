// The /for/[use-case] pages: one per place a launch video gets posted. Each answers the searcher's
// question first (size, length, format), then gives tips and a starting style.
import type { Aspect } from '../plan';

export interface UseCase {
  slug: string;
  name: string;
  keyword: string;
  title: string;
  description: string;
  h1: string;
  // the answer, in the first screen
  answer: string;
  specs: { label: string; value: string }[];
  aspect: Aspect;
  seconds: [number, number];
  // what the video is for, as the director prompt puts it
  purpose: string;
  tips: { title: string; text: string }[];
  recipes: string[];
  faq: { q: string; a: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'product-hunt-launch-video',
    name: 'Product Hunt launch video',
    keyword: 'product hunt video',
    title: 'Product Hunt launch video maker: free, from screenshots',
    description:
      'Make a Product Hunt launch video from your screenshots in two minutes: 16:9, 30–60 seconds, AI-directed, free. Upload it to YouTube and add the link to your gallery.',
    h1: 'Make your Product Hunt launch video from screenshots',
    answer:
      'Product Hunt shows a video as the first item of your gallery from a YouTube link. Make a 16:9 video of 30–60 seconds, upload it to YouTube (unlisted is fine) and paste the link when you add media. Lead with what the product does in the first three seconds; most visitors watch muted.',
    specs: [
      { label: 'Aspect', value: '16:9 (1920×1080)' },
      { label: 'Length', value: '30–60 seconds' },
      { label: 'Where it goes', value: 'A YouTube link, first in the gallery' },
      { label: 'Sound', value: 'Optional; captions carry the story' },
    ],
    aspect: '16:9',
    seconds: [25, 45],
    purpose: 'a Product Hunt launch (16:9, shown in the launch gallery, watched mostly muted)',
    tips: [
      {
        title: 'Say what it does in the hook',
        text: 'The first line should be the outcome ("Changelogs that write themselves"), not your logo. Hunters decide in seconds.',
      },
      {
        title: 'One feature per scene',
        text: 'Three to five scenes, each zooming into one thing that matters. Skip settings pages and empty states.',
      },
      {
        title: 'End on the name and URL',
        text: 'Every PromoReel video ends on an outro card with your name and link, so a screenshot of the last frame still works.',
      },
      {
        title: 'Reuse it everywhere',
        text: 'Export a 9:16 version too and post it on X, TikTok and Reels on launch day.',
      },
    ],
    recipes: ['clean-apple', 'brutalist', 'swiss-minimal'],
    faq: [
      {
        q: 'Can I upload an MP4 straight to Product Hunt?',
        a: 'The gallery takes a YouTube link for video. Upload your MP4 to YouTube first, then add the link as gallery media.',
      },
      {
        q: 'How long should a Product Hunt video be?',
        a: 'Aim for 30–60 seconds. Shorter is fine if it shows the product clearly; longer videos rarely get watched to the end.',
      },
    ],
  },
  {
    slug: 'app-store-preview-video',
    name: 'App Store preview video',
    keyword: 'app store preview video size',
    title: 'App Store preview video: size, length and a free maker',
    description:
      'App Store preview videos are 15–30 seconds, portrait or landscape, at your device size (886×1920 for 6.9-inch iPhones). Make one from screenshots, free in your browser.',
    h1: 'App Store preview video: the right size, and a quick way to make one',
    answer:
      'An App Store app preview is 15–30 seconds long, at most 30 fps, in .mov, .m4v or .mp4 with H.264. Each device size has its own resolution: 886×1920 for 6.9-inch iPhones, 1080×1920 for 5.5-inch iPhones. Apple asks that previews show your app’s real UI, so keep moves subtle and let the screens do the talking.',
    specs: [
      { label: 'Length', value: '15–30 seconds' },
      { label: 'iPhone 6.9″', value: '886×1920 portrait' },
      { label: 'iPhone 5.5″', value: '1080×1920 portrait' },
      { label: 'Format', value: 'H.264 .mp4/.mov, up to 30 fps' },
    ],
    aspect: '9:16',
    seconds: [15, 28],
    purpose: 'an App Store app preview (15–30 seconds, must mostly show the real app UI, subtle motion)',
    tips: [
      {
        title: 'Use the Clean style',
        text: 'Flat screens, soft slides and gentle zooms read as your app, not an ad. Avoid spins and glitches here.',
      },
      {
        title: 'Front-load the best screen',
        text: 'The preview autoplays muted in search results; the first three seconds decide whether anyone taps.',
      },
      {
        title: 'Check Apple’s rules before you submit',
        text: 'Apple reviews previews. Its guidelines ask for in-app footage; marketing-style frames and hands can be rejected.',
      },
      {
        title: 'Resize for each device',
        text: 'PromoReel exports 1080×1920. That fits 5.5-inch iPhones directly; scale it to 886×1920 for the 6.9-inch slot.',
      },
    ],
    recipes: ['clean-apple', 'swiss-minimal'],
    faq: [
      {
        q: 'How long can an App Store preview be?',
        a: '15 to 30 seconds. You can add up to three previews per localization.',
      },
      {
        q: 'Will a stylized promo pass App Review?',
        a: 'Not always. Apple expects previews to show the app itself, so use a subtle style here and keep louder styles for social posts.',
      },
    ],
  },
  {
    slug: 'tiktok-app-promo',
    name: 'TikTok app promo',
    keyword: 'tiktok app promo video',
    title: 'TikTok app promo video from your screenshots, free',
    description:
      'Make a 9:16 TikTok promo for your app in two minutes: 15–30 seconds, captions in the safe zone, a hook in the first second. Free, in your browser.',
    h1: 'Make a TikTok promo for your app from screenshots',
    answer:
      'A TikTok promo should be vertical 9:16 at 1080×1920, 15–30 seconds long, with the hook on screen in the first second. Keep text out of the bottom fifth and the right edge, where TikTok draws its buttons and caption. PromoReel places captions inside that safe area for you.',
    specs: [
      { label: 'Aspect', value: '9:16 (1080×1920)' },
      { label: 'Length', value: '15–30 seconds' },
      { label: 'Safe zone', value: 'Clear of the bottom ~20% and right edge' },
      { label: 'Sound', value: 'Add a trending sound in the app after upload' },
    ],
    aspect: '9:16',
    seconds: [12, 22],
    purpose: 'a TikTok post (9:16, fast, hook in the first second, captions must be readable without sound)',
    tips: [
      {
        title: 'Pick a loud style',
        text: 'Y2K Chrome and Brutalist stop the scroll; the calm styles get skipped on TikTok.',
      },
      {
        title: 'Cut on the beat',
        text: 'Add your track and its BPM; PromoReel snaps every cut to the beat.',
      },
      {
        title: 'Post the video, add sound in TikTok',
        text: 'Export without music if you want to use a trending sound from TikTok’s library instead.',
      },
      {
        title: 'Show a person too',
        text: 'Pair the promo with a short selfie clip explaining why you built it. The promo becomes the B-roll.',
      },
    ],
    recipes: ['y2k-chrome', 'brutalist', 'retro-terminal'],
    faq: [
      {
        q: 'What size is a TikTok video?',
        a: '1080×1920 pixels, 9:16 vertical. PromoReel exports exactly that.',
      },
      {
        q: 'Where should text go on TikTok?',
        a: 'Away from the bottom fifth and the right edge, where TikTok shows its buttons, username and caption.',
      },
    ],
  },
  {
    slug: 'x-launch-video',
    name: 'X (Twitter) launch video',
    keyword: 'twitter launch video',
    title: 'X / Twitter launch video for your app, free from screenshots',
    description:
      'Make a launch video for X (Twitter) from your screenshots: 16:9 or 9:16, 15–45 seconds, captions that work muted. Free, private, in your browser.',
    h1: 'Make a launch video for X from your screenshots',
    answer:
      'Videos on X autoplay muted in the timeline, so the story has to work with captions alone. Post a 16:9 (1920×1080) or 9:16 (1080×1920) MP4 of 15–45 seconds, attach it to your launch post, and put the link in the post text, not just in the video.',
    specs: [
      { label: 'Aspect', value: '16:9 or 9:16' },
      { label: 'Length', value: '15–45 seconds' },
      { label: 'Playback', value: 'Autoplays muted' },
      { label: 'Format', value: 'MP4, H.264 + AAC' },
    ],
    aspect: '16:9',
    seconds: [15, 30],
    purpose: 'a launch post on X (autoplays muted in the timeline; captions carry the story)',
    tips: [
      {
        title: 'Write the post for the video',
        text: 'One line of what it does, the video, then the link. The video earns the stop; the text earns the click.',
      },
      {
        title: 'Vertical gets more room on phones',
        text: 'Most people scroll X on a phone. A 9:16 video takes the full width and more height.',
      },
      {
        title: 'Use a style that matches your audience',
        text: 'Retro Terminal and Swiss Minimal read well with developer audiences; Y2K Chrome for consumer apps.',
      },
    ],
    recipes: ['retro-terminal', 'swiss-minimal', 'y2k-chrome'],
    faq: [
      {
        q: 'Does X autoplay video with sound?',
        a: 'No, videos autoplay muted in the timeline. Make sure the captions tell the story.',
      },
      {
        q: 'Which aspect ratio works best on X?',
        a: 'Both 16:9 and 9:16 work. Vertical video takes more of the screen on phones.',
      },
    ],
  },
  {
    slug: 'saas-demo-video',
    name: 'SaaS promo video',
    keyword: 'saas promo video',
    title: 'SaaS promo video for your landing page, free from screenshots',
    description:
      'Make a short SaaS promo video for your landing page hero from product screenshots: 16:9, 20–40 seconds, muted autoplay loop. Free, in your browser.',
    h1: 'A SaaS promo video for your landing page, from screenshots',
    answer:
      'A landing-page promo is a 16:9 loop of 20–40 seconds that autoplays muted in the hero, next to your headline. It is not a full demo: show three or four screens, each zoomed into the feature that sells, and let your page copy do the explaining. For a full walkthrough, record a separate screen-capture demo.',
    specs: [
      { label: 'Aspect', value: '16:9 (1920×1080)' },
      { label: 'Length', value: '20–40 seconds, loops' },
      { label: 'Playback', value: 'Muted autoplay, playsinline' },
      { label: 'Weight', value: 'Compress to a few MB for fast pages' },
    ],
    aspect: '16:9',
    seconds: [20, 35],
    purpose: 'a SaaS landing page hero (16:9, autoplays muted on a loop next to the headline)',
    tips: [
      {
        title: 'Match your site',
        text: 'Override the brand colour with your site’s accent so the video looks native on the page.',
      },
      {
        title: 'Keep it light',
        text: 'Use a poster image and lazy-load the video so it doesn’t hurt your page’s LCP.',
      },
      {
        title: 'Zoom into outcomes',
        text: 'Point each scene at a result: the chart going up, the inbox at zero, the deploy succeeding.',
      },
    ],
    recipes: ['clean-apple', 'swiss-minimal'],
    faq: [
      {
        q: 'Is this a product demo video?',
        a: 'It’s a short promo built from screenshots. For a step-by-step demo, record your screen; use the promo as the hook above it.',
      },
      {
        q: 'Should a landing page video autoplay?',
        a: 'Muted, looping autoplay is fine for a short promo. Always add a poster image and never autoplay sound.',
      },
    ],
  },
  {
    slug: 'what-i-shipped-video',
    name: '"What I shipped" changelog video',
    keyword: 'changelog video',
    title: '"What I shipped" changelog video from screenshots, free',
    description:
      'Turn this week’s changelog into a 10–20 second video for X, LinkedIn or your changelog page. Drop in screenshots of what changed; AI writes the captions.',
    h1: 'Turn your changelog into a "what I shipped" video',
    answer:
      'A "what I shipped" video is a 10–20 second clip with one screen per change and a caption each. Post it with your weekly update on X or LinkedIn, or embed it at the top of your changelog. Building in public works best on a schedule: same style, same day, every week.',
    specs: [
      { label: 'Aspect', value: '9:16 for social, 16:9 for a changelog page' },
      { label: 'Length', value: '10–20 seconds' },
      { label: 'Scenes', value: 'One per change, three or four in all' },
      { label: 'Cadence', value: 'Weekly, same style each time' },
    ],
    aspect: '9:16',
    seconds: [10, 18],
    purpose: 'a weekly "what I shipped" changelog post (one scene per change, quick)',
    tips: [
      {
        title: 'Pick one style and keep it',
        text: 'A consistent look makes your weekly posts recognizable in the feed.',
      },
      {
        title: 'Caption the change, not the feature',
        text: '"Exports are 3× faster" beats "New export pipeline".',
      },
      {
        title: 'Paste your changelog into the prompt',
        text: 'With Copy prompt, add your release notes to the chat; the AI writes captions from them.',
      },
    ],
    recipes: ['retro-terminal', 'brutalist', 'swiss-minimal'],
    faq: [
      {
        q: 'How long should a changelog video be?',
        a: '10–20 seconds: three or four changes, one screen each.',
      },
      {
        q: 'Where do I post it?',
        a: 'X and LinkedIn with your weekly update, and at the top of your changelog page.',
      },
    ],
  },
];

export const findUseCase = (slug: string) => USE_CASES.find(u => u.slug === slug);
