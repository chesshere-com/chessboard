import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..");

const docPages = fs.existsSync(path.join(root, "docs"))
  ? Object.fromEntries(
      fs.readdirSync(path.join(root, "docs")).filter((f) => f.endsWith(".html")).map((f) => [`docs/${f}`, path.join(root, "docs", f)]),
    )
  : {};

export default defineConfig({
  root,
  base: "./",
  plugins: [solid()],
  build: {
    outDir: path.join(repo, "site-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.join(root, "index.html"),
        playground: path.join(root, "playground/index.html"),
        ...docPages,
      },
    },
  },
  server: { port: 5199, strictPort: false, fs: { allow: [repo] } },
});
