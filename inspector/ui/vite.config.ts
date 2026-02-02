import { defineConfig } from "vite";
import macros from "unplugin-parcel-macros";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    macros.vite(), // Must be first!
    react(),
  ],
  server: {
    proxy: {
      "/watchScopes": "http://localhost:41000",
      "/play": "http://localhost:41000",
    },
  },
  build: {
    outDir: "ui/dist",
    target: ["es2022"],
    // Lightning CSS produces a much smaller CSS bundle than the default minifier.
    cssMinify: "lightningcss",
    rollupOptions: {
      output: {
        // Bundle all S2 and style-macro generated CSS into a single bundle instead of code splitting.
        // Because atomic CSS has so much overlap between components, loading all CSS up front results in
        // smaller bundles instead of producing duplication between pages.
        manualChunks(id) {
          if (
            /macro-(.*)\.css$/.test(id) ||
            /@react-spectrum\/s2\/.*\.css$/.test(id)
          ) {
            return "s2-styles";
          }
        },
      },
    },
  },
});
