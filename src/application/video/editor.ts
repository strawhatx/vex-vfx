// The editor: the use cases behind /create. Start from an example, restyle it, change the format and
// brand colour, edit any slot, confirm numbers, reorder scenes, and export. Every change is saved
// on this device. A saved project is checked again when it's loaded, so an old or broken save can
// never stop the editor from opening.
import { checkPlan } from '@/domain/video/check';
import {
  addScene,
  blockers,
  confirmNumber,
  duplicateScene,
  editSlot,
  moveScene,
  removeScene,
  restyle,
  setSeconds,
  setTransition,
  type SlotValue,
} from '@/domain/video/edit';
import { DEFAULT_EXAMPLE, exampleById, examplePlan } from '@/domain/video/examples';
import type { TransitionMove } from '@/domain/video/moves';
import type { Format, Plan } from '@/domain/video/plan';
import { isEmail } from '@/domain/video/product';
import type { Recipe } from '@/domain/video/recipe';
import { DEFAULT_RECIPE, recipeBySlug } from '@/domain/video/recipes';
import type { SceneType } from '@/domain/video/scenes';
import type { Exporter, Project, ProjectStore, Subscriber } from './ports';

export interface Notice {
  tone: 'info' | 'warn' | 'error';
  text: string;
  items?: string[];
}

export interface EditorState {
  project: Project;
  // the scene being edited
  selected: number;
  // bumps when scenes are added, removed or reordered, or the whole plan is replaced, so the UI can
  // reset its fields (text fields keep their own value while typing)
  rev: number;
  notice: Notice | null;
  busy: 'exporting' | null;
  // export progress, 0..1
  progress: number;
}

export interface EditorDeps {
  exporter: Exporter;
  subscriber: Subscriber;
  store: ProjectStore;
}

const HEX = /^#[0-9a-f]{6}$/i;

export class Editor {
  private state: EditorState;
  private listeners = new Set<() => void>();
  private notifying = false;

  constructor(
    private deps: EditorDeps,
    start: { example?: string; aesthetic?: string; format?: Format } = {},
  ) {
    const saved = start.example ? null : this.restore();
    let project = saved ?? fromExample(start.example ?? DEFAULT_EXAMPLE.id);
    const recipe = recipeBySlug(start.aesthetic ?? '');
    if (recipe) project = { ...project, plan: restyle(project.plan, recipe) };
    if (start.format) project = { ...project, plan: { ...project.plan, format: start.format } };
    this.state = { project, selected: 0, rev: 0, notice: null, busy: null, progress: 0 };
    if (!saved) deps.store.save(project);
  }

  // --- reading -------------------------------------------------------------------------------

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  plan = () => this.state.project.plan;
  recipe = (): Recipe => recipeBySlug(this.plan().aesthetic) ?? DEFAULT_RECIPE;
  blockers = () => blockers(this.plan());

  // --- the whole video -----------------------------------------------------------------------

  // start again from an example, keeping the style, brand colour and logo already chosen
  loadExample(id: string) {
    if (!exampleById(id)) return;
    const { plan, logo } = this.state.project;
    let next = examplePlan(id);
    next = restyle(next, this.recipe());
    if (plan.brandColor) next.brandColor = plan.brandColor;
    this.commit({ plan: next, logo, example: id }, { selected: 0, notice: null, rev: this.state.rev + 1 });
  }

  setAesthetic(slug: string) {
    const r = recipeBySlug(slug);
    if (r && r.slug !== this.plan().aesthetic) this.update(restyle(this.plan(), r), this.bump());
  }

  setFormat(format: Format) {
    this.update({ ...this.plan(), format });
  }

  setBrand(hex: string | null) {
    this.update({ ...this.plan(), brandColor: hex && HEX.test(hex) ? hex : null });
  }

  setProduct(p: { name?: string; url?: string }) {
    const product = { ...this.plan().product, ...p };
    product.name = product.name.slice(0, 32);
    product.url = product.url.slice(0, 80);
    this.update({ ...this.plan(), product });
  }

  setCaptions(on: boolean) {
    this.update({ ...this.plan(), captions: on });
  }

  setLogo(dataUrl: string | null) {
    this.commit({ ...this.state.project, logo: dataUrl });
  }

  // --- scenes --------------------------------------------------------------------------------

  select(i: number) {
    if (this.plan().scenes[i]) this.set({ selected: i });
  }

  setSlot(i: number, key: string, value: SlotValue) {
    this.update(editSlot(this.plan(), i, key, value));
  }

  confirmNumber(i: number, key: string) {
    this.update(confirmNumber(this.plan(), i, key));
  }

  setSeconds(i: number, sec: number) {
    this.update(setSeconds(this.plan(), i, sec));
  }

  setTransition(i: number, t: TransitionMove | null) {
    this.update(setTransition(this.plan(), i, t));
  }

  moveScene(from: number, to: number) {
    const next = moveScene(this.plan(), from, to);
    if (next !== this.plan()) this.update(next, { selected: to, ...this.bump() });
  }

  duplicateScene(i: number) {
    this.update(duplicateScene(this.plan(), i), { selected: i + 1, ...this.bump() });
  }

  removeScene(i: number) {
    const next = removeScene(this.plan(), i);
    this.update(next, { selected: Math.min(this.state.selected, next.scenes.length - 1), ...this.bump() });
  }

  addScene(type: SceneType) {
    const at = this.state.selected;
    this.update(addScene(this.plan(), type, this.recipe(), at), { selected: at + 1, ...this.bump() });
  }

  // --- export --------------------------------------------------------------------------------

  // signs the email up (a failure doesn't block the download) and renders the MP4; null if it didn't
  async exportVideo(email: string): Promise<Blob | null> {
    const todo = this.blockers();
    if (todo.length) {
      this.set({ notice: { tone: 'error', text: 'Finish these before downloading:', items: todo } });
      return null;
    }
    if (!isEmail(email)) {
      this.set({ notice: { tone: 'error', text: 'Enter a valid email to download.' } });
      return null;
    }
    if (!(await this.deps.exporter.supported())) {
      this.set({
        notice: {
          tone: 'error',
          text: 'This browser can’t make video files. Use a recent Chrome, Safari or Firefox.',
        },
      });
      return null;
    }
    this.set({ busy: 'exporting', progress: 0, notice: null });
    const signedUp = this.deps.subscriber.subscribe(email.trim(), 'create').catch(() => false);
    try {
      const { plan, logo } = this.state.project;
      const blob = await this.deps.exporter.export({ plan, logo }, progress => this.set({ progress }));
      await signedUp;
      this.set({ busy: null, progress: 1 });
      return blob;
    } catch {
      this.set({
        busy: null,
        notice: { tone: 'error', text: 'The export stopped. Try again, or try a desktop browser.' },
      });
      return null;
    }
  }

  // --- internals -----------------------------------------------------------------------------

  private restore(): Project | null {
    let saved: Project | null = null;
    try {
      saved = this.deps.store.load();
    } catch {
      return null;
    }
    if (!saved) return null;
    const c = checkPlan(saved.plan);
    if (!c.ok) return null;
    return {
      plan: c.plan,
      logo: typeof saved.logo === 'string' && saved.logo.startsWith('data:image/') ? saved.logo : null,
      example: exampleById(saved.example) ? saved.example : DEFAULT_EXAMPLE.id,
    };
  }

  private bump = () => ({ rev: this.state.rev + 1 });

  private update(plan: Plan, extra: Partial<EditorState> = {}) {
    if (plan === this.plan() && !Object.keys(extra).length) return;
    this.commit({ ...this.state.project, plan }, extra);
  }

  private commit(project: Project, extra: Partial<EditorState> = {}) {
    this.set({ project, ...extra });
    try {
      this.deps.store.save(project);
    } catch {
      // storage full or blocked: keep editing; it just won't survive a reload
    }
  }

  // listeners hear about changes once per microtask, however many changes an action made
  private set(p: Partial<EditorState>) {
    this.state = { ...this.state, ...p };
    if (this.notifying) return;
    this.notifying = true;
    queueMicrotask(() => {
      this.notifying = false;
      this.listeners.forEach(fn => fn());
    });
  }
}

function fromExample(id: string): Project {
  return { plan: examplePlan(id), logo: null, example: exampleById(id)?.id ?? DEFAULT_EXAMPLE.id };
}
