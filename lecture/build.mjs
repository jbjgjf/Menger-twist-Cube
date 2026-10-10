// Renders $…$ / $$…$$ with KaTeX into out/, then prints the paper documents to PDF.
// KATEX=/path/to/node_modules/katex  CHROME=/path/to/chrome  node lecture/build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const katex = require(process.env.KATEX ?? 'katex');
const chrome = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const render = (html) =>
  html
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => katex.renderToString(tex, { displayMode: true, throwOnError: true }))
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => katex.renderToString(tex, { throwOnError: true }));

mkdirSync(join(here, 'out'), { recursive: true });
copyFileSync(join(here, 'src/style.css'), join(here, 'out/style.css'));

for (const name of ['handout', 'notes', 'screen']) {
  const out = join(here, 'out', `${name}.html`);
  writeFileSync(out, render(readFileSync(join(here, 'src', `${name}.html`), 'utf8')));
  if (name === 'screen') continue;
  execFileSync(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
    '--virtual-time-budget=4000', `--print-to-pdf=${join(here, `${name}.pdf`)}`, `file://${out}`,
  ], { stdio: 'ignore' });
}
