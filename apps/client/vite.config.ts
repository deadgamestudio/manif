import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { seo } from "./seo/plugin.ts";

export default defineConfig({
  plugins: [
    react(),
    // The title, description and link preview tags, in the HTML itself (seo/).
    seo(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
