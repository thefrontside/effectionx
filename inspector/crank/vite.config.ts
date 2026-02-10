import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { join, dirname } from "node:path";

const shoelaceIcons = join(
  dirname(import.meta.resolve("@shoelace-style/shoelace")),
  "assets/icons/*.svg",
).replace(/^file:/, "");

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: shoelaceIcons,
          dest: "shoelace/assets/icons",
        },
      ],
    }),
  ],
  server: {
    proxy: {
      "/watchScopes": "http://localhost:41000",
      "/watchPlayerState": "http://localhost:41000",
      "/play": "http://localhost:41000",
    },
  },
  build: {
    // relative to this config file, not the package root
    outDir: "dist",
    // Lightning CSS produces a much smaller CSS bundle than the default minifier.
    cssMinify: "lightningcss",
  },
});
