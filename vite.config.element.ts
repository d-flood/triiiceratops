import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      // @ts-ignore - The types for this function signature might be slightly off in the plugin dts but valid in Svelte
      compilerOptions: (url) => {
        return {
          customElement: url.includes("TriiiceratopsViewerElement.svelte"),
        };
      },
    }),
    tailwindcss(),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/custom-element.ts"),
      name: "TriiiceratopsElement",
      fileName: "triiiceratops-element",
      formats: ["es", "iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "triiiceratops-element.[ext]", // Name CSS file consistently
      },
    },
    outDir: "dist",
    emptyOutDir: false, // Don't clear dist (lib build runs first)
    cssCodeSplit: false, // Output single CSS file
  },
});
