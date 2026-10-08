#!/usr/bin/env node
/*
 * Assemble la page publiable (dist/dashboard-eso.html) à partir de src/.
 * La page est un fragment HTML (titre, style, corps) : le squelette
 * <html>/<head>/<body> est ajouté par l'outil de publication des artefacts.
 *
 *   node build.mjs            → dist/dashboard-eso.html
 *   node build.mjs --standalone → dist/dashboard-eso.standalone.html (ouvrable dans un navigateur, mode démonstration)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, "src", f), "utf8");

export function buildPage() {
  const guard = (s) => s.replace(/<\/script/gi, "<\\/script");
  return src("page.html")
    .replace("/*__CSS__*/", () => src("styles.css"))
    .replace("/*__CORE__*/", () => guard(src("core.js")))
    .replace("/*__UI__*/", () => guard(src("ui.js")));
}

export function buildStandalone() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif;background:#f6f7f9}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${buildPage()}
</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(here, "dist");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "dashboard-eso.html"), buildPage());
  writeFileSync(join(out, "dashboard-eso.standalone.html"), buildStandalone());
  const size = Buffer.byteLength(buildPage(), "utf8");
  console.log(`dist/dashboard-eso.html écrit (${(size / 1024).toFixed(1)} Ko)`);
  console.log("dist/dashboard-eso.standalone.html écrit (aperçu navigateur, données de démonstration)");
}
