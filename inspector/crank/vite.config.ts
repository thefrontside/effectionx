import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { join, dirname } from "node:path";

const shoelaceIcons = join(dirname(import.meta.resolve("@shoelace-style/shoelace")), "assets/icons/*.svg").replace(/^file:/,'');

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: shoelaceIcons,
          dest: 'shoelace/assets/icons'
        }
      ]
    })
  ]
});
