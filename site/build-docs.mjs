import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..");
const out = path.join(root, "docs");
const GITHUB = "https://github.com/chesshere-com/chessboard/blob/main/";

const pages = [
  ["getting-started", "Getting started", "index"],
  ["configuration", "Configuration"],
  ["api", "API"],
  ["shapes", "Shapes and drawing"],
  ["theming", "Theming"],
  ["piece-sets", "Piece sets"],
  ["solid", "SolidJS and chrome"],
];
const slug = new Map(pages.map(([name, , file]) => [name, file ?? name]));

const marked = new Marked(
  markedHighlight({
    emptyLangClass: "hljs",
    langPrefix: "hljs language-",
    highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])),
  }),
);

marked.use({
  walkTokens(token) {
    if (token.type !== "link") return;
    const href = token.href;
    if (/^(https?:|#|mailto:)/.test(href)) return;
    const [target, hash = ""] = href.split("#");
    const md = target.match(/^([\w-]+)\.md$/);
    if (md && slug.has(md[1])) {
      token.href = `${slug.get(md[1])}.html${hash ? "#" + hash : ""}`;
    } else {
      token.href = GITHUB + path.posix.normalize(path.posix.join("docs", target)).replace(/^\.\.\//, "");
    }
  },
});

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const [name, title, file] of pages) {
  const md = await readFile(path.join(repo, "docs", `${name}.md`), "utf8");
  const body = marked.parse(md);
  const nav = pages
    .map(([n, t, f]) => `<a href="${f ?? n}.html"${n === name ? ' aria-current="page"' : ""}>${esc(t)}</a>`)
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - chessboard</title>
<meta name="description" content="chessboard documentation: ${esc(title)}">
<link rel="stylesheet" href="../site.css">
</head>
<body class="docs">
<header class="top">
  <a class="brand" href="../index.html">chessboard</a>
  <nav><a href="index.html">Docs</a><a href="../playground/index.html">Playground</a><a href="https://github.com/chesshere-com/chessboard">GitHub</a></nav>
</header>
<div class="docs-layout">
  <aside class="side"><nav>${nav}</nav></aside>
  <main class="prose">${body}</main>
</div>
</body>
</html>
`;
  await writeFile(path.join(out, `${file ?? name}.html`), html);
}
console.log(`rendered ${(await readdir(out)).length} doc pages`);
