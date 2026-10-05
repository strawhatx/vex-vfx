// The studio: the use cases behind /create. Pick an aesthetic, add screenshots and the product's
// details, get a plan (rules, a pasted AI reply, or the user's own API key), edit it, and export.
// Every plan is validated; anything that fails falls back to the rule-based plan, so there's always
// a video to watch.
import { autoPlan } from '@/domain/promo/autoPlan';
import { extractJson } from '@/domain/promo/parse';
import { brandColor } from '@/domain/promo/palette';
import { DEFAULT_ASPECT, LIMITS, type Aspect, type Plan } from '@/domain/promo/plan';
import { EMPTY_PRODUCT, isEmail, PRODUCT_LIMITS, type Product } from '@/domain/promo/product';
import { directorPrompt } from '@/domain/promo/prompt';
import type { Recipe } from '@/domain/promo/recipe';
import { DEFAULT_RECIPE, recipeBySlug } from '@/domain/promo/recipes';
import { snapToBeats } from '@/domain/promo/schedule';
import { trimText, validatePlan } from '@/domain/promo/validate';
import type { Director, Exporter, Subscriber } from './ports';

export const MAX_SHOTS = 6;

export interface Shot {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Music {
  name: string;
  bpm: number | null;
}

export type DirectMode = 'auto' | 'paste' | 'api';

export interface Notice {
  tone: 'info' | 'warn' | 'error';
  text: string;
  fixes?: string[];
}

export interface StudioState {
  recipe: Recipe;
  aspect: Aspect;
  shots: Shot[];
  product: Product;
  // the colour sampled from the screenshots, and the user's own pick over it
  sampled: string | null;
  brandOverride: string | null;
  plan: Plan | null;
  source: DirectMode | null;
  notice: Notice | null;
  music: Music | null;
  busy: 'directing' | 'exporting' | null;
  // export progress, 0..1
  progress: number;
}

export interface StudioDeps {
  director: Director;
  exporter: Exporter;
  subscriber: Subscriber;
  // a fresh seed for the rule-based plan (the domain has no randomness of its own)
  newSeed: () => number;
  // what the video is for, used in the prompt (e.g. from a /for page)
  purpose?: string;
}

export class Studio {
  private state: StudioState;
  private listeners = new Set<() => void>();
  private pixels = new Map<string, Uint8ClampedArray>();
  private seed: number;
  private apiKey = '';
  private notifying = false;
  private purpose: string | undefined;
  private seconds: [number, number] | undefined;

  constructor(
    private deps: StudioDeps,
    start: { recipe?: string; aspect?: Aspect } = {},
  ) {
    this.seed = deps.newSeed();
    this.purpose = deps.purpose;
    this.state = {
      recipe: recipeBySlug(start.recipe ?? '') ?? DEFAULT_RECIPE,
      aspect: start.aspect ?? DEFAULT_ASPECT,
      shots: [],
      product: EMPTY_PRODUCT,
      sampled: null,
      brandOverride: null,
      plan: null,
      source: null,
      notice: null,
      music: null,
      busy: null,
      progress: 0,
    };
  }

  // --- reading -------------------------------------------------------------------------------

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  brand(): string {
    const s = this.state;
    return s.brandOverride ?? s.sampled ?? s.recipe.palette.accent;
  }

  // the plan as it plays: in the chosen aspect, with cuts on the beat if there's a bpm
  playable(): Plan | null {
    const { plan, aspect, music } = this.state;
    return plan ? snapToBeats({ ...plan, aspect }, music?.bpm ?? null) : null;
  }

  // the prompt to paste into a chat (or send with the API key)
  prompt(): string {
    const s = this.state;
    return directorPrompt({
      recipe: s.recipe,
      product: s.product,
      shots: s.shots.length,
      aspect: s.aspect,
      purpose: this.purpose,
      seconds: this.seconds,
    });
  }

  // what the video is for (from a /for page) and its target length, used in the director prompt
  setPurpose(purpose: string | undefined, seconds?: [number, number]) {
    this.purpose = purpose;
    this.seconds = seconds;
  }

  canDirect = () => this.state.shots.length > 0;

  // --- choosing ------------------------------------------------------------------------------

  pick(slug: string) {
    const recipe = recipeBySlug(slug);
    if (!recipe || recipe === this.state.recipe) return;
    this.set({ recipe });
    this.refit();
  }

  setAspect(aspect: Aspect) {
    this.set({ aspect, plan: this.state.plan && { ...this.state.plan, aspect } });
  }

  // shots with a small sample of their pixels (for the brand colour); keeps at most MAX_SHOTS
  addShots(added: { shot: Shot; pixels: Uint8ClampedArray }[]) {
    const room = MAX_SHOTS - this.state.shots.length;
    const kept = added.slice(0, Math.max(0, room));
    for (const a of kept) this.pixels.set(a.shot.id, a.pixels);
    this.set({
      shots: [...this.state.shots, ...kept.map(a => a.shot)],
      notice:
        kept.length < added.length
          ? { tone: 'warn', text: `Up to ${MAX_SHOTS} screenshots: kept the first ${MAX_SHOTS}.` }
          : this.state.notice,
    });
    this.resample();
    this.refit();
    return kept.map(a => a.shot.id);
  }

  removeShot(id: string) {
    this.pixels.delete(id);
    this.set({ shots: this.state.shots.filter(s => s.id !== id) });
    this.resample();
    this.refit();
  }

  moveShot(from: number, to: number) {
    this.set({ shots: move(this.state.shots, from, to) });
    this.refit();
  }

  setProduct(p: Partial<Product>) {
    const next = { ...this.state.product, ...p };
    next.name = next.name.slice(0, PRODUCT_LIMITS.name);
    next.tagline = next.tagline.slice(0, PRODUCT_LIMITS.tagline);
    next.url = next.url.slice(0, PRODUCT_LIMITS.url);
    this.set({ product: next });
    // the outro always shows the product as it is now
    const { plan } = this.state;
    if (plan) this.revalidate(plan, this.state.source ?? 'auto', false);
  }

  setBrand(hex: string | null) {
    this.set({ brandOverride: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null });
  }

  setMusic(music: Music | null) {
    this.set({ music });
  }

  setBpm(bpm: number | null) {
    if (this.state.music) this.set({ music: { ...this.state.music, bpm } });
  }

  // --- directing -----------------------------------------------------------------------------

  // the rule-based plan (a new take each time it's asked again)
  directAuto(fresh = false) {
    if (!this.canDirect()) return this.needShots();
    if (fresh) this.seed = this.deps.newSeed();
    const s = this.state;
    const plan = autoPlan({
      recipe: s.recipe,
      shots: s.shots.length,
      product: s.product,
      aspect: s.aspect,
      seed: this.seed,
    });
    this.revalidate(plan, 'auto', true);
  }

  // a plan pasted back from a chat
  directPaste(text: string) {
    if (!this.canDirect()) return this.needShots();
    const raw = extractJson(text);
    if (raw == null) return this.fallBack('There was no plan (JSON) in what you pasted.');
    this.revalidate(raw, 'paste', true);
  }

  // a plan from the user's own API key; the key stays in memory here only
  async directApi(apiKey: string) {
    if (!this.canDirect()) return this.needShots();
    if (!apiKey.trim()) return this.set({ notice: { tone: 'error', text: 'Add your API key first.' } });
    this.apiKey = apiKey.trim();
    this.set({ busy: 'directing', notice: null });
    try {
      const reply = await this.deps.director.direct({
        prompt: this.prompt(),
        shotIds: this.state.shots.map(s => s.id),
        apiKey: this.apiKey,
      });
      this.set({ busy: null });
      const raw = extractJson(reply);
      if (raw == null) return this.fallBack('The AI didn’t answer with a plan.');
      this.revalidate(raw, 'api', true);
    } catch (e) {
      this.set({ busy: null });
      this.fallBack(e instanceof Error ? e.message : 'The AI call failed.');
    }
  }

  // "Re-direct": a new take from the same director (a pasted plan can't be re-asked, so the rules
  // give a new take instead)
  async redirect() {
    if (this.state.source === 'api' && this.apiKey) return this.directApi(this.apiKey);
    this.directAuto(true);
  }

  // --- editing the plan ----------------------------------------------------------------------

  editCaption(scene: number, text: string) {
    this.editPlan(p => {
      const s = p.scenes[scene];
      if (!s) return;
      const t = trimText(text, LIMITS.caption);
      s.caption = t ? { text: t, move: s.caption?.move ?? this.state.recipe.moves.text[0] } : null;
    });
  }

  editHook(text: string) {
    this.editPlan(p => {
      p.hook.text = trimText(text, LIMITS.hookText) || p.hook.text;
    });
  }

  moveScene(from: number, to: number) {
    this.editPlan(p => {
      p.scenes = move(p.scenes, from, to);
    });
  }

  removeScene(i: number) {
    if ((this.state.plan?.scenes.length ?? 0) <= LIMITS.scenes[0]) return;
    this.editPlan(p => {
      p.scenes.splice(i, 1);
    });
  }

  // --- export --------------------------------------------------------------------------------

  // signs the email up (a failure doesn't block the download) and renders the MP4; null if it failed
  async exportVideo(email: string): Promise<Blob | null> {
    const plan = this.playable();
    if (!plan) return (this.needShots(), null);
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
      const s = this.state;
      const blob = await this.deps.exporter.export(
        {
          plan,
          recipe: s.recipe,
          product: s.product,
          brand: this.brand(),
          shotIds: s.shots.map(x => x.id),
          withMusic: !!s.music,
        },
        progress => this.set({ progress }),
      );
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

  // state changes at once; listeners hear about it once per microtask, however many changes an
  // action made (so one keystroke is one render, not several)
  private set(p: Partial<StudioState>) {
    this.state = { ...this.state, ...p };
    if (this.notifying) return;
    this.notifying = true;
    queueMicrotask(() => {
      this.notifying = false;
      this.listeners.forEach(fn => fn());
    });
  }

  private ctx() {
    const s = this.state;
    return { recipe: s.recipe, shots: s.shots.length, product: s.product, aspect: s.aspect };
  }

  private revalidate(raw: unknown, source: DirectMode, announce: boolean) {
    const v = validatePlan(raw, this.ctx());
    if (!v.ok) return this.fallBack(v.reason);
    this.set({
      plan: v.plan,
      source,
      notice: !announce
        ? this.state.notice
        : v.fixes.length && source !== 'auto'
          ? {
              tone: 'info',
              text: `Plan ready. We tidied ${v.fixes.length} thing${v.fixes.length === 1 ? '' : 's'}.`,
              fixes: v.fixes,
            }
          : null,
    });
  }

  // the plan couldn't be used: show the rule-based one and say why
  private fallBack(reason: string) {
    if (!this.canDirect()) return this.needShots();
    const s = this.state;
    const plan = autoPlan({
      recipe: s.recipe,
      shots: s.shots.length,
      product: s.product,
      aspect: s.aspect,
      seed: this.seed,
    });
    const v = validatePlan(plan, this.ctx());
    this.set({
      plan: v.ok ? v.plan : null,
      source: 'auto',
      notice: { tone: 'warn', text: `${reason} Showing the automatic plan instead.` },
    });
  }

  private needShots() {
    this.set({ notice: { tone: 'error', text: 'Add at least one screenshot first.' } });
  }

  // after the aesthetic or screenshots change: a new rule-based plan, or the current plan fitted
  private refit() {
    const { plan, source } = this.state;
    if (!plan) return;
    if (!this.canDirect()) return this.set({ plan: null, source: null });
    if (source === 'auto') this.directAuto();
    else this.revalidate(plan, source ?? 'auto', false);
  }

  private resample() {
    const all = this.state.shots.map(s => this.pixels.get(s.id)).filter((p): p is Uint8ClampedArray => !!p);
    const joined = new Uint8ClampedArray(all.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of all) {
      joined.set(p, at);
      at += p.length;
    }
    this.set({ sampled: brandColor(joined) });
  }

  private editPlan(fn: (p: Plan) => void) {
    const { plan } = this.state;
    if (!plan) return;
    const next: Plan = structuredClone(plan);
    fn(next);
    this.set({ plan: next });
  }
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}
