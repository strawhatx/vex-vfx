import 'server-only';
import { z } from 'zod';

// what /api/subscribe accepts; `company` is a honeypot real people never fill in
export const SubscribeBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  source: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9-]*$/)
    .default('site'),
  company: z.string().max(200).optional().default(''),
});

export type SubscribeBody = z.infer<typeof SubscribeBody>;
