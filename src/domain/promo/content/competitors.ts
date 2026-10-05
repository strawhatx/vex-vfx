// The /alternatives/[competitor] pages: honest, factual comparisons. Prices change, so the pages
// describe pricing models and send readers to each product's own site for numbers.

export interface Competitor {
  slug: string;
  name: string;
  keyword: string;
  site: string;
  what: string;
  bestFor: string;
  // a fair row-by-row comparison: [aspect, them, PromoReel]
  rows: [string, string, string][];
  chooseThem: string[];
  chooseUs: string[];
}

export const REVIEWED = '2026-10-05';

export const COMPETITORS: Competitor[] = [
  {
    slug: 'rotato',
    name: 'Rotato',
    keyword: 'rotato alternative',
    site: 'https://rotato.app',
    what: 'Rotato is a Mac app for animating 3D device mockups: you place screenshots or screen recordings on realistic phones and laptops and keyframe the camera.',
    bestFor: 'Designers who want precise control over photoreal 3D device shots.',
    rows: [
      ['Platform', 'macOS app', 'Any modern browser'],
      ['Price model', 'Paid licence', 'Free'],
      ['How you animate', 'Keyframe the camera yourself', 'AI or rules direct the whole video'],
      ['Devices', 'Detailed 3D device models', 'Stylized frames per aesthetic'],
      ['Captions and outro', 'Add them in a video editor', 'Built in'],
      ['Screenshots leave your device', 'No (local app)', 'No (runs in your browser)'],
    ],
    chooseThem: [
      'You want photoreal 3D devices and full camera control.',
      'You already work on a Mac and edit in Final Cut or Premiere.',
    ],
    chooseUs: [
      'You want a finished, captioned video in two minutes.',
      'You are not on a Mac, or don’t want to learn keyframing.',
    ],
  },
  {
    slug: 'screen-studio',
    name: 'Screen Studio',
    keyword: 'screen studio alternative',
    site: 'https://screen.studio',
    what: 'Screen Studio is a Mac screen recorder that makes recordings look polished, with automatic zoom on clicks, smooth cursor movement and backgrounds.',
    bestFor: 'Product demos and tutorials recorded from a live app.',
    rows: [
      ['Platform', 'macOS app', 'Any modern browser'],
      ['Price model', 'Paid', 'Free'],
      ['Input', 'A screen recording', '3–6 screenshots'],
      ['Best length', 'Demos of a minute or more', '10–45 second promos'],
      ['Styles', 'Clean recording look', 'Five aesthetics, from Clean to Brutalist'],
      ['Screenshots leave your device', 'No (local app)', 'No (runs in your browser)'],
    ],
    chooseThem: [
      'You need a real walkthrough of a live product.',
      'You record tutorials or onboarding videos.',
    ],
    chooseUs: [
      'You have screenshots, not a recording, and want a short promo.',
      'You want a styled launch video for social, not a demo.',
    ],
  },
  {
    slug: 'canva',
    name: 'Canva',
    keyword: 'canva alternative for app promo video',
    site: 'https://www.canva.com',
    what: 'Canva is a browser design tool with a video editor and thousands of templates, used for everything from slides to social posts.',
    bestFor: 'Teams making lots of different marketing assets in one place.',
    rows: [
      ['Platform', 'Browser and apps', 'Browser'],
      ['Price model', 'Free plan and paid plans', 'Free'],
      ['Account', 'Required', 'Not needed'],
      ['How you build it', 'Edit a template by hand', 'Drop screenshots; AI directs'],
      ['Made for', 'All kinds of design', 'Software launch videos only'],
      ['Uploads', 'Files are uploaded to Canva', 'Screenshots never leave your browser'],
    ],
    chooseThem: ['You need posters, slides and videos in one tool.', 'You want to hand-edit every frame.'],
    chooseUs: [
      'You want a launch video without designing one.',
      'You’d rather not upload unreleased screens anywhere.',
    ],
  },
  {
    slug: 'previewed',
    name: 'Previewed',
    keyword: 'previewed alternative',
    site: 'https://previewed.app',
    what: 'Previewed is a browser tool for device mockups and App Store screenshots, with animated mockup templates.',
    bestFor: 'App Store screenshot sets and mockup images.',
    rows: [
      ['Platform', 'Browser', 'Browser'],
      ['Price model', 'Free plan and paid plans', 'Free'],
      ['Main output', 'Mockup images and animations', 'Captioned promo videos'],
      ['Direction', 'Pick and edit a template', 'AI plans scenes, zooms and captions'],
      ['Account', 'Required for most features', 'Not needed'],
      ['Uploads', 'Files are uploaded to the service', 'Screenshots never leave your browser'],
    ],
    chooseThem: ['You need App Store screenshot sets.', 'You want many mockup scenes to choose from.'],
    chooseUs: [
      'You want a whole launch video, captions and outro included.',
      'You want to keep unreleased screens on your machine.',
    ],
  },
];

export const competitorBySlug = (slug: string) => COMPETITORS.find(c => c.slug === slug);
