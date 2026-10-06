import { describe, expect, it } from 'vitest';
import { examplePlan } from '@/domain/video/examples';
import { Editor } from './editor';
import { FakeExporter, FakeSubscriber, MemoryStore } from './fakes';
import type { Project } from './ports';

function make(
  o: {
    store?: MemoryStore;
    canEncode?: boolean;
    failExport?: boolean;
    newsletterOk?: boolean;
    example?: string;
  } = {},
) {
  const store = o.store ?? new MemoryStore();
  const exporter = new FakeExporter(o.canEncode ?? true, o.failExport ?? false);
  const subscriber = new FakeSubscriber(o.newsletterOk ?? true);
  const editor = new Editor({ exporter, subscriber, store }, { example: o.example });
  return { editor, store, exporter, subscriber };
}

describe('Editor', () => {
  it('opens on the default example and saves it', () => {
    const { editor, store } = make();
    expect(editor.getState().project.example).toBe('orbit-launch');
    expect(store.project?.plan.scenes.length).toBeGreaterThan(0);
  });

  it('reopens the saved project', () => {
    const store = new MemoryStore();
    make({ store }).editor.setSlot(1, 'text', 'Saved text');
    const { editor } = make({ store });
    const s = editor.plan().scenes[1];
    expect(s.type === 'kinetic-type' && s.text).toBe('Saved text');
  });

  it('a broken save never stops it opening', () => {
    const store = new MemoryStore({
      plan: { scenes: [] },
      logo: 'javascript:alert(1)',
      example: 'x',
    } as unknown as Project);
    const { editor } = make({ store });
    expect(editor.getState().project.example).toBe('orbit-launch');
    expect(editor.getState().project.logo).toBeNull();
  });

  it('a saved logo must be an image data URL', () => {
    const store = new MemoryStore({
      plan: examplePlan('orbit-stats'),
      logo: 'data:image/png;base64,AAA',
      example: 'orbit-stats',
    });
    expect(make({ store }).editor.getState().project.logo).toBe('data:image/png;base64,AAA');
  });

  it('restyles, keeping the scenes', () => {
    const { editor } = make();
    const n = editor.plan().scenes.length;
    editor.setAesthetic('brutalist');
    expect(editor.plan().aesthetic).toBe('brutalist');
    expect(editor.plan().scenes).toHaveLength(n);
  });

  it('a new example keeps the chosen style and brand colour', () => {
    const { editor } = make();
    editor.setAesthetic('swiss-minimal');
    editor.setBrand('#2E8B57');
    editor.loadExample('orbit-stats');
    expect(editor.plan().aesthetic).toBe('swiss-minimal');
    expect(editor.plan().brandColor).toBe('#2E8B57');
    expect(editor.plan().format).toBe('1:1');
  });

  it('ignores a brand colour that isn’t #rrggbb', () => {
    const { editor } = make();
    editor.setBrand('green');
    expect(editor.plan().brandColor).toBeNull();
  });

  it('tells listeners once per batch of changes', async () => {
    const { editor } = make();
    let calls = 0;
    editor.subscribe(() => calls++);
    editor.setFormat('1:1');
    editor.setSlot(0, 'name', 'Atlas');
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it('selects the scene that moved, was added or duplicated', () => {
    const { editor } = make();
    editor.moveScene(0, 2);
    expect(editor.getState().selected).toBe(2);
    editor.addScene('stat-ring');
    expect(editor.getState().selected).toBe(3);
    expect(editor.plan().scenes[3].type).toBe('stat-ring');
  });

  describe('export', () => {
    it('is blocked until every number is filled in and confirmed', async () => {
      const { editor, exporter } = make({ example: 'starter' });
      expect(await editor.exportVideo('dev@example.com')).toBeNull();
      expect(editor.getState().notice?.items).toEqual(['Scene 2: fill in the number']);
      editor.setSlot(1, 'value', 1200);
      expect(await editor.exportVideo('dev@example.com')).not.toBeNull();
      expect(exporter.jobs).toHaveLength(1);
    });

    it('needs a valid email', async () => {
      const { editor, exporter } = make();
      expect(await editor.exportVideo('nope')).toBeNull();
      expect(exporter.jobs).toHaveLength(0);
    });

    it('signs the email up and renders the plan with the logo', async () => {
      const { editor, exporter, subscriber } = make();
      editor.setLogo('data:image/png;base64,AAA');
      const blob = await editor.exportVideo(' dev@example.com ');
      expect(blob?.type).toBe('video/mp4');
      expect(subscriber.emails).toEqual(['dev@example.com']);
      expect(exporter.jobs[0].logo).toBe('data:image/png;base64,AAA');
      expect(editor.getState().progress).toBe(1);
    });

    it('still downloads when the newsletter is down', async () => {
      const { editor } = make({ newsletterOk: false });
      expect(await editor.exportVideo('dev@example.com')).not.toBeNull();
    });

    it('says to use a recent browser without WebCodecs', async () => {
      const { editor } = make({ canEncode: false });
      expect(await editor.exportVideo('dev@example.com')).toBeNull();
      expect(editor.getState().notice?.text).toMatch(/recent Chrome, Safari or Firefox/);
    });

    it('reports a failed export and clears busy', async () => {
      const { editor } = make({ failExport: true });
      expect(await editor.exportVideo('dev@example.com')).toBeNull();
      expect(editor.getState().busy).toBeNull();
    });
  });
});
