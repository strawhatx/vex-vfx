import { describe, expect, it } from 'vitest';
import { recipeBySlug } from '@/domain/promo/recipes';
import { schedule } from '@/domain/promo/schedule';
import { counter, FakeDirector, FakeExporter, FakeSubscriber } from './fakes';
import { MAX_SHOTS, Studio, type Shot } from './studio';

const shot = (id: string): { shot: Shot; pixels: Uint8ClampedArray } => ({
  shot: { id, name: `${id}.png`, width: 1170, height: 2532 },
  pixels: new Uint8ClampedArray(Array.from({ length: 50 }, () => [99, 91, 255, 255]).flat()),
});

function make(
  over: { reply?: string | Error; canEncode?: boolean; failExport?: boolean; newsletterOk?: boolean } = {},
) {
  const director = new FakeDirector(over.reply ?? '{}');
  const exporter = new FakeExporter(over.canEncode ?? true, over.failExport ?? false);
  const subscriber = new FakeSubscriber(over.newsletterOk ?? true);
  const studio = new Studio({ director, exporter, subscriber, newSeed: counter() }, { recipe: 'y2k-chrome' });
  return { studio, director, exporter, subscriber };
}

const withShots = (s: Studio, n = 3) => s.addShots(Array.from({ length: n }, (_, i) => shot(`s${i}`)));

const aiPlan = (move = 'tilt-float') =>
  JSON.stringify({
    v: 1,
    aspect: '9:16',
    hook: { text: 'Changelogs, done', move: 'word-slam', duration: 1.5 },
    scenes: [0, 1, 2].map(i => ({
      shot: i,
      duration: 2,
      move,
      zoom: { x: 0.5, y: 0.4, scale: 1.4 },
      caption: { text: `Benefit ${i}`, move: 'word-pop' },
      transition: 'flash-cut',
      extra: null,
    })),
    outro: { cta: 'Get it' },
  });

describe('Studio', () => {
  it('tells listeners once per batch of changes', async () => {
    const { studio } = make();
    let calls = 0;
    studio.subscribe(() => calls++);
    withShots(studio);
    studio.directAuto();
    studio.setProduct({ name: 'Orbit' });
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it('starts on the aesthetic it was opened with', () => {
    expect(make().studio.getState().recipe.slug).toBe('y2k-chrome');
  });

  it('needs a screenshot before it can direct', () => {
    const { studio } = make();
    studio.directAuto();
    expect(studio.getState().plan).toBeNull();
    expect(studio.getState().notice?.tone).toBe('error');
  });

  it('keeps at most six screenshots and samples the brand colour from them', () => {
    const { studio } = make();
    withShots(studio, 8);
    expect(studio.getState().shots).toHaveLength(MAX_SHOTS);
    expect(studio.getState().notice?.tone).toBe('warn');
    expect(studio.brand()).toBe('#635bff');
    studio.setBrand('#ff0000');
    expect(studio.brand()).toBe('#ff0000');
    studio.setBrand(null);
    expect(studio.brand()).toBe('#635bff');
  });

  it('makes a rule-based plan, and a new take on Re-direct', async () => {
    const { studio } = make();
    withShots(studio);
    studio.directAuto();
    const first = studio.getState().plan;
    expect(first?.scenes).toHaveLength(3);
    await studio.redirect();
    expect(studio.getState().plan).not.toEqual(first);
    expect(studio.getState().source).toBe('auto');
  });

  it('uses a pasted plan, and says what it tidied', () => {
    const { studio } = make();
    withShots(studio);
    studio.directPaste('Here you go:\n```json\n' + aiPlan('barrel-roll') + '\n```');
    const s = studio.getState();
    expect(s.source).toBe('paste');
    expect(s.plan?.hook.text).toBe('Changelogs, done');
    expect(s.notice?.fixes?.length).toBe(3);
  });

  it('falls back to the rule-based plan when the paste has no plan', () => {
    const { studio } = make();
    withShots(studio);
    studio.directPaste('Sorry, I cannot see images.');
    expect(studio.getState().source).toBe('auto');
    expect(studio.getState().plan).not.toBeNull();
    expect(studio.getState().notice?.tone).toBe('warn');
  });

  it('sends the prompt, screenshots and key to the AI, and uses its plan', async () => {
    const { studio, director } = make({ reply: aiPlan() });
    withShots(studio);
    await studio.directApi('sk-ant-test');
    expect(director.calls[0].apiKey).toBe('sk-ant-test');
    expect(director.calls[0].shotIds).toEqual(['s0', 's1', 's2']);
    expect(director.calls[0].prompt).toContain('Y2K Chrome');
    expect(studio.getState().source).toBe('api');
    // Re-direct asks the AI again
    await studio.redirect();
    expect(director.calls).toHaveLength(2);
  });

  it('falls back with the AI’s error when the call fails', async () => {
    const { studio } = make({ reply: new Error('Invalid API key.') });
    withShots(studio);
    await studio.directApi('bad');
    expect(studio.getState().busy).toBeNull();
    expect(studio.getState().source).toBe('auto');
    expect(studio.getState().notice?.text).toMatch(/Invalid API key/);
  });

  it('refits the plan when the aesthetic changes', () => {
    const { studio } = make({ reply: aiPlan() });
    withShots(studio);
    studio.directPaste(aiPlan('device-frame-spin'));
    studio.pick('brutalist');
    const plan = studio.getState().plan!;
    for (const s of plan.scenes) expect(recipeBySlug('brutalist')!.moves.screen).toContain(s.move);
  });

  it('edits captions, the hook, and the order of scenes', () => {
    const { studio } = make();
    withShots(studio);
    studio.directPaste(aiPlan());
    studio.editCaption(1, '  Ship   on time  ');
    studio.editHook('New hook');
    studio.moveScene(0, 2);
    const p = studio.getState().plan!;
    expect(p.hook.text).toBe('New hook');
    expect(p.scenes.map(s => s.shot)).toEqual([1, 2, 0]);
    expect(p.scenes[0].caption?.text).toBe('Ship on time');
    studio.editCaption(0, '');
    expect(studio.getState().plan!.scenes[0].caption).toBeNull();
  });

  it('keeps the outro on the product as its details change', () => {
    const { studio } = make();
    withShots(studio);
    studio.directAuto();
    studio.setProduct({ name: 'Orbit', url: 'https://orbit.dev/' });
    expect(studio.getState().plan!.outro).toMatchObject({ title: 'Orbit', url: 'orbit.dev' });
  });

  it('snaps cuts to the beat when the music has a bpm', () => {
    const { studio } = make();
    withShots(studio);
    studio.directAuto();
    studio.setMusic({ name: 'song.mp3', bpm: 120 });
    const { spans } = schedule(studio.playable()!);
    for (const s of spans.slice(0, -1)) expect((s.end / 0.5) % 1).toBeCloseTo(0, 5);
  });

  it('tells the director what the video is for', () => {
    const { studio } = make();
    withShots(studio);
    studio.setPurpose('a Product Hunt launch', [25, 45]);
    expect(studio.prompt()).toContain('for a Product Hunt launch');
    expect(studio.prompt()).toContain('25–45 second');
  });

  it('switches aspect on the plan that plays', () => {
    const { studio } = make();
    withShots(studio);
    studio.directAuto();
    studio.setAspect('16:9');
    expect(studio.playable()!.aspect).toBe('16:9');
  });

  describe('export', () => {
    it('needs a valid email', async () => {
      const { studio, exporter } = make();
      withShots(studio);
      studio.directAuto();
      expect(await studio.exportVideo('nope')).toBeNull();
      expect(exporter.jobs).toHaveLength(0);
    });

    it('signs the email up and renders the plan with the brand colour', async () => {
      const { studio, exporter, subscriber } = make();
      withShots(studio);
      studio.directAuto();
      const blob = await studio.exportVideo(' dev@example.com ');
      expect(blob?.type).toBe('video/mp4');
      expect(subscriber.emails).toEqual(['dev@example.com']);
      expect(exporter.jobs[0].brand).toBe('#635bff');
      expect(studio.getState().progress).toBe(1);
    });

    it('still downloads when the newsletter is down', async () => {
      const { studio } = make({ newsletterOk: false });
      withShots(studio);
      studio.directAuto();
      expect(await studio.exportVideo('dev@example.com')).not.toBeNull();
    });

    it('says to use a recent browser without WebCodecs', async () => {
      const { studio } = make({ canEncode: false });
      withShots(studio);
      studio.directAuto();
      expect(await studio.exportVideo('dev@example.com')).toBeNull();
      expect(studio.getState().notice?.text).toMatch(/recent Chrome, Safari or Firefox/);
    });

    it('reports a failed export and clears busy', async () => {
      const { studio } = make({ failExport: true });
      withShots(studio);
      studio.directAuto();
      expect(await studio.exportVideo('dev@example.com')).toBeNull();
      expect(studio.getState().busy).toBeNull();
    });
  });
});
