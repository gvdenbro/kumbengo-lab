import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  output: 'static',
  site: 'https://kumbengo-lab.pages.dev',
  vite: { plugins: [yaml()] },
});
