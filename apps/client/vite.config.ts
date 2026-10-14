import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { seo } from "./seo/plugin.ts";

export default defineConfig({
  plugins: [
    react(),
    // The title, description and link preview tags, in the HTML itself (seo/).
    seo(),
    entryWithout3d(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});

/**
 * Fails the build if three.js or React Three Fiber end up in the entry chunk
 * (#88): the homepage, the lobby and /aide must not download the 3D engine.
 * They slip back in when a module the entry imports (audio, controls, touch,
 * a HUD...) imports something 3D: move that piece into a three-free file.
 * package.json's `sideEffects` is what lets the feature barrels (index.ts)
 * re-export 3D components without dragging them along.
 */
function entryWithout3d(): Plugin {
  return {
    name: "manif:entry-without-3d",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.isEntry) continue;
        const leaked = Object.keys(chunk.modules).filter((id) => /node_modules\/(three|@react-three)\//.test(id) && chunk.modules[id]!.renderedLength > 0);
        if (leaked.length > 0) this.error(`three.js is in the entry chunk ${chunk.fileName}: ${leaked.join(", ")}`);
      }
    },
  };
}
