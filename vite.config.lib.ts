import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    svelte(),
    dts({
      include: ["src/lib"],
      tsconfigPath: "./tsconfig.app.json",
      outDir: "dist",
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "Triiiceratops",
      fileName: "triiiceratops",
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "svelte",
        "svelte/internal",
        /^svelte\//,
        "openseadragon",
        "manifesto.js",
        /^phosphor-svelte/,
        "@tailwindcss/vite",
        "daisyui",
        "tailwindcss",
      ],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
