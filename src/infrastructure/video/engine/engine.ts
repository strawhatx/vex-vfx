// The video engine: draws any frame of a plan onto a canvas. The preview seeks it on every animation
// frame; the export seeks it frame by frame. Same code, same frames: a frame depends only on the
// plan, the logo and the time.
import type { Plan } from '@/domain/video/plan';
import { resolvePalette, type Recipe } from '@/domain/video/recipe';
import { DEFAULT_RECIPE, recipeBySlug } from '@/domain/video/recipes';
import { ctx2d, makeCanvas, type AnyCanvas, type Ctx2D, type ImageLike } from '../canvas';
import { drawBackdrop, drawTexture } from './backdrop';
import type { FontFamilies } from './fonts';
import { geometry, type Geometry } from './geometry';
import { drawEndCard, drawScene, type SceneCtx } from './scenes';
import { activeAt, buildTimeline, type Built, type Part } from './timeline';
import { drawCut } from './transitions';

export const FPS = 30;
export { frameSize } from './geometry';

export interface EngineInput {
  plan: Plan;
  logo: ImageLike | null;
}

export class Engine {
  private built: Built | null = null;
  private input: EngineInput | null = null;
  private recipe: Recipe = DEFAULT_RECIPE;
  private layers: [AnyCanvas, AnyCanvas] | null = null;
  private g: Ctx2D;

  constructor(
    private canvas: AnyCanvas,
    private fonts: FontFamilies,
  ) {
    this.g = ctx2d(canvas);
  }

  get duration() {
    return this.built?.duration ?? 0;
  }

  load(input: EngineInput) {
    this.built?.tl.kill();
    this.input = input;
    this.recipe = recipeBySlug(input.plan.aesthetic) ?? DEFAULT_RECIPE;
    this.built = buildTimeline(input.plan, this.recipe);
  }

  // stops the timeline (the engine can be dropped after this)
  dispose() {
    this.built?.tl.kill();
    this.built = null;
  }

  setFonts(fonts: FontFamilies) {
    this.fonts = fonts;
  }

  // draws the frame at t seconds
  render(t: number) {
    const { canvas, input, built, recipe } = this;
    if (!input || !built) return;
    const W = canvas.width,
      H = canvas.height;
    if (!this.layers || this.layers[0].width !== W || this.layers[0].height !== H)
      this.layers = [makeCanvas(W, H), makeCanvas(W, H)];
    const G = geometry(W, H, input.plan.format);
    const pal = resolvePalette(recipe, input.plan.brandColor);
    t = Math.max(0, Math.min(built.duration - 1e-4, t));
    built.tl.time(t, true);
    const frame = Math.round(t * FPS);
    const g = this.g;

    drawBackdrop(g, recipe, pal, G, t);
    const now = activeAt(built, t);
    const [la, lb] = this.layers;
    this.drawPart(ctx2d(la), now.a, t, frame, G, pal);
    if (now.b && now.cut) {
      this.drawPart(ctx2d(lb), now.b, t, frame, G, pal);
      g.save();
      drawCut(g, la, lb, now.cut.move, now.cut.state.k, G, frame, {
        flash: '#ffffff',
        edge: pal.accent,
        bg: pal.bg,
      });
      g.restore();
    } else g.drawImage(la, 0, 0);
    drawTexture(g, canvas, recipe, G, frame);
  }

  // one part, drawn on a clear layer (the backdrop stays behind both layers of a cut)
  private drawPart(c: Ctx2D, part: Part, t: number, frame: number, G: Geometry, pal: SceneCtx['pal']) {
    const { input } = this;
    if (!input) return;
    c.clearRect(0, 0, G.W, G.H);
    const ctx: SceneCtx = {
      G,
      recipe: this.recipe,
      pal,
      fonts: this.fonts,
      t,
      lt: t - part.start,
      len: part.end - part.start,
      frame,
      logo: input.logo,
      product: input.plan.product,
    };
    if (part.kind === 'end') drawEndCard(c, ctx);
    else drawScene(c, ctx, input.plan.scenes[part.index], input.plan.captions);
  }
}
