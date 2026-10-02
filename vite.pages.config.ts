import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const pagesRoot = fileURLToPath(new URL("./pages-src", import.meta.url));
const outputDirectory = fileURLToPath(new URL("./dist-pages", import.meta.url));

export default defineConfig({
  root: pagesRoot,
  base: "/Hydrocarbon-Lab/",
  cacheDir: fileURLToPath(new URL("./node_modules/.vite-pages", import.meta.url)),
  plugins: [react()],
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: {
        root: fileURLToPath(new URL("./pages-src/index.html", import.meta.url)),
        es: fileURLToPath(new URL("./pages-src/es/index.html", import.meta.url)),
        en: fileURLToPath(new URL("./pages-src/en/index.html", import.meta.url)),
      },
    },
  },
});
