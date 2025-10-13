import { defineConfig } from 'tsup';
import path from "path";

export default defineConfig({
  clean: true,
  entry: ['./src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  treeshake: true,
  cjsInterop: true,
  sourcemap: true,

  // add your alias here:
  esbuildOptions(options) {
    options.alias = {
      '@': path.resolve(__dirname, 'src'),
    };
  },
});
