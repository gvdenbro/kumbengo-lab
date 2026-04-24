import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const stepSchema = z.object({
  t: z.number(),
  string: z.string().optional(),
  strings: z.array(z.string()).optional(),
}).refine(d => d.string || d.strings, {
  message: 'Each step needs string or strings',
});

const layerSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  steps: z.array(stepSchema),
});

const pieces = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/pieces' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    tuning: z.string(),
    tempo: z.number(),
    tags: z.array(z.string()),
    layers: z.array(layerSchema).min(1),
  }),
});

export const collections = { pieces };
