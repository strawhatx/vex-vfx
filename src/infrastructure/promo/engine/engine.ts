// The video engine: draws any frame of a plan onto a canvas. The preview seeks it on every animation
// frame; the export seeks it frame by frame. Same code, same frames.
import type { Plan } from '@/domain/promo/plan';
import type { Product } from '@/domain/promo/product';
import type { Recipe } from '@/domain/promo/recipe';
import { luminance } from '@/domain/promo/palette';
import { ctx2d, makeCanvas, type AnyCanvas, type Ctx2D } from '../canvas';
import type { ShotImage } from '../shots';
import { drawBackdrop, drawTexture, grain } from './backdrop';
import { drawHook, drawOutro, titleStyle } from './cards';
import { fontString, type FontFamilies } from './fonts';
import { geometry, type Geometry } from './geometry';
import { drawScreen } from './screens';
import { drawText, layoutText } from './text';
import { activeAt, buildTimeline, type Built, type Part } from './timeline';
import { drawCut } from './transitions';

export const FPS = 30;

export interface EngineInput {
  plan: Plan;
  recipe: Recipe;
  product: Product;
  brand: string;
  // screenshots in the order the plan's shot indexes refer to
  shots: ShotImage[];
}

export class Engine {
  private built: Built | null = null;
  private input: EngineInput | null = null;
  private G!: Geometry;
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
    this.built = buildTimeline(input.plan, input.recipe);
  }

  setFonts(fonts: FontFamilies) {
    this.fonts = fonts;
  }

  // draws the frame at t seconds
  render(t: number) {
    const { canvas, input, built } = this;
    if (!input || !built) return;
    const W = canvas.width,
      H = canvas.height;
    if (
      !this.G ||
      this.G.W !== W ||
      this.G.H !== H ||
      this.layers?.[0].width !== W ||
      this.layers?.[0].height !== H
    ) {
      this.layers = [makeCanvas(W, H), makeCanvas(W, H)];
    }
    this.G = geometry(W, H, input.plan.aspect, input.recipe.layout);
    t = Math.max(0, Math.min(built.duration - 1e-4, t));
    built.tl.time(t, true);
    const frame = Math.round(t * FPS);
    const g = this.g;

    drawBackdrop(g, input.recipe, this.G, input.brand, t);
    const now = activeAt(built, t);
    const [la, lb] = this.layers!;
    this.drawPart(ctx2d(la), now.a, t, frame, 0);
    if (now.b && now.cut) {
      this.drawPart(ctx2d(lb), now.b, t, frame, 1);
      g.save();
      drawCut(g, la, lb, now.cut.move, now.cut.state.k, this.G, frame, '#ffffff');
      g.restore();
    } else g.drawImage(la, 0, 0);
    drawTexture(g, canvas, input.recipe, this.G, frame);
  }

  private drawPart(c: Ctx2D, part: Part, t: number, frame: number, slot: number) {
    const { input } = this;
    if (!input) return;
    const { plan, recipe, brand } = input;
    const G = this.G;
    c.clearRect(0, 0, G.W, G.H);
    const st = { recipe, brand, fonts: this.fonts };
    if (part.kind === 'hook') return drawHook(c, plan, part.state, G, st, t);
    if (part.kind === 'outro') return drawOutro(c, plan, part.state, G, st, t);

    const scene = plan.scenes[part.index];
    const img = input.shots[scene.shot];
    if (img) drawScreen(c, img, scene, part.state, G, { recipe, brand }, slot);
    if (scene.extra === 'grain') grain(c, G, frame, 0.09);
    if (scene.caption) {
      const cap = G.caption;
      const style = {
        ...titleStyle(st, cap.size, cap.align),
        font: fontString(this.fonts, recipe.fonts.display, cap.size),
      };
      const text = recipe.layout === 'terminal' ? `> ${scene.caption.text}` : scene.caption.text;
      const L = layoutText(c, text, style, cap.maxW, 3);
      // on dark stages a soft band behind the caption keeps it readable over a busy screenshot
      if (luminance(recipe.palette.bg) < 0.2) {
        c.save();
        c.globalAlpha = 0.55 * Math.min(1, part.state.words * 3);
        const grad = c.createLinearGradient(0, cap.y - L.height, 0, cap.y + L.height);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, recipe.palette.bg);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = grad;
        c.fillRect(0, cap.y - L.height, G.W, L.height * 2);
        c.restore();
      }
      drawText(c, L, style, scene.caption.move, part.state.words, cap.x, cap.y, t);
    }
  }
}

// the frame size for an aspect at a given height of the short side
export const frameSize = (aspect: Plan['aspect'], short = 1080): [number, number] =>
  aspect === '9:16' ? [short, Math.round((short * 16) / 9)] : [Math.round((short * 16) / 9), short];
