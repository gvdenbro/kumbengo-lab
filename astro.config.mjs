import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  site: 'https://kumbengo-lab.pages.dev',
  integrations: [react()],
  vite: { plugins: [yaml()] },
});
