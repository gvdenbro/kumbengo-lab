import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import tuningsRaw from './data/tunings.yaml';

const knownTunings = Object.keys(tuningsRaw) as [string, ...string[]];

const stringId = z.string().regex(
  /^(L([1-9]|1[01])|R([1-9]|10))$/,
  'String ID must be L1\u2013L11 or R1\u2013R10',
);

const stepSchema = z.object({
  d: z.number().positive(),
  string: stringId.optional(),
  strings: z.array(stringId).optional(),
}).refine(d => !(d.string && d.strings), {
  message: 'Use string or strings, not both',
});

const arrangementSchema = z.object({
  name: z.string(),
  steps: z.preprocess(
    (val) => Array.isArray(val) ? val.flat(Infinity) : val,
    z.array(stepSchema),
  ),
});

const pieces = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/pieces' }),
  schema: z.object({
    title: z.string(),
    tuning: z.enum(knownTunings),
    tempo: z.number().optional(),
    tags: z.array(z.string()),
    arrangements: z.array(arrangementSchema).min(1),
  }),
});

export const collections = { pieces };
