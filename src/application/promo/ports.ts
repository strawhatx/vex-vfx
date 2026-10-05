// What the studio needs from the outside, named by what it does. The browser adapters in
// infrastructure/promo implement these; tests use the fakes in fakes.ts.
import type { Plan } from '@/domain/promo/plan';
import type { Product } from '@/domain/promo/product';
import type { Recipe } from '@/domain/promo/recipe';

// asks an AI to direct: sends the prompt and the screenshots, returns its reply as text
export interface Director {
  direct(request: { prompt: string; shotIds: string[]; apiKey: string }): Promise<string>;
}

export interface ExportJob {
  plan: Plan;
  recipe: Recipe;
  product: Product;
  brand: string;
  shotIds: string[];
  withMusic: boolean;
}

// renders a plan to an MP4, frame by frame
export interface Exporter {
  // whether this browser can encode video at all
  supported(): Promise<boolean>;
  export(job: ExportJob, progress: (done: number) => void): Promise<Blob>;
}

// adds an email to the newsletter; false if that failed (the download goes ahead anyway)
export interface Subscriber {
  subscribe(email: string, source: string): Promise<boolean>;
}
