import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export default defineConfig({
  root: __dirname,
  plugins: [solid()],
  server: { port: 5199, strictPort: false, fs: { allow: [root] } },
});
