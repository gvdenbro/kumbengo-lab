import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const stringId = z.string().regex(
  /^(L([1-9]|1[01])|R([1-9]|10))$/,
  'String ID must be L1–L11 or R1–R10',
);

const stepSchema = z.object({
  t: z.number(),
  string: stringId.optional(),
  strings: z.array(stringId).optional(),
}).refine(d => d.string || d.strings, {
  message: 'Each step needs string or strings',
}).refine(d => !(d.string && d.strings), {
  message: 'Use string or strings, not both',
});

const arrangementSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  steps: z.array(stepSchema),
});

const knownTunings = ['silaba'] as const;

const pieces = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/pieces' }),
  schema: z.object({
    title: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    tuning: z.enum(knownTunings),
    tempo: z.number(),
    tags: z.array(z.string()),
    arrangements: z.array(arrangementSchema).min(1),
  }),
});

export const collections = { pieces };
