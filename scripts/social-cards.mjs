#!/usr/bin/env node
// Render the committed social-preview PNGs. Re-run and commit after editing the HTML below.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const SITE = 'triiiceratops.org';
const SOCIAL_DIR = join(REPO_ROOT, 'apps', 'site', 'static', 'social');

const NAVY = 'oklch(25.33% 0.016 252.42)'; // --tri-viewer-bg (slate)
const DEEP = 'oklch(17.5% 0.012 254.09)'; // --tri-surface-border (slate)
const AMBER = 'oklch(78% 0.15 80)'; // --tri-primary
const AMBER_INK = 'oklch(28% 0.08 70)'; // --tri-primary-content
const PAPER = 'oklch(97.807% 0.029 256.847)'; // --tri-content (slate)

/** Playwright resolved from packages/core. */
function loadChromium() {
    const require = createRequire(
        join(REPO_ROOT, 'packages', 'core', 'package.json'),
    );
    for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
        try {
            return require(id).chromium;
        } catch {
            /* try the next candidate */
        }
    }
    throw new Error(
        'Playwright not found. Run `pnpm install` at the repo root, then ' +
            '`pnpm --filter triiiceratops exec playwright install chromium`.',
    );
}

/** Inline an image as a data URI. */
function dataUri(relPath) {
    const buf = readFileSync(join(REPO_ROOT, relPath));
    const mime = relPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
}

/** One of the repository's self-hosted faces, as a data URI. */
function fontUri(name) {
    const buf = readFileSync(
        join(REPO_ROOT, 'apps', 'site', 'static', 'fonts', name),
    );
    return `data:font/woff2;base64,${buf.toString('base64')}`;
}

const FONT_FACES = `
  @font-face {
    font-family: 'Source Serif 4';
    src: url(${fontUri('SourceSerif4Variable-Roman.woff2')}) format('woff2');
    font-weight: 200 900;
    font-style: normal;
  }
  @font-face {
    font-family: 'Source Code Pro';
    src: url(${fontUri('SourceCodeVariable-Roman.woff2')}) format('woff2');
    font-weight: 200 900;
    font-style: normal;
  }`;

/** Shared 1200x630 page chrome. */
function shell(body) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${FONT_FACES}
  :root {
    --navy: ${NAVY}; --deep: ${DEEP}; --amber: ${AMBER};
    --amber-ink: ${AMBER_INK}; --paper: ${PAPER};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: 'Source Serif 4', Georgia, serif;
    background: var(--navy);
    color: var(--paper);
    position: relative;
    background-image:
      radial-gradient(75% 70% at 0% 100%, var(--deep) 0%, transparent 72%);
  }
  .mono { font-family: 'Source Code Pro', ui-monospace, monospace; }
  /* A card is read at thumbnail size. */
  .eyebrow {
    font-size: 22px; font-weight: 700; letter-spacing: 0.2em;
    color: var(--amber); text-transform: uppercase;
  }
  h1 { font-weight: 800; letter-spacing: -0.034em; }
  p {
    font-size: 29px; line-height: 1.38; font-weight: 400;
    color: color-mix(in oklab, var(--paper) 80%, transparent);
  }
  .url {
    position: absolute; left: 72px; bottom: 58px;
    font-size: 23px; font-weight: 500; letter-spacing: -0.01em;
    color: color-mix(in oklab, var(--paper) 60%, transparent);
  }
  .url b { color: var(--amber); font-weight: 700; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function docsCard(logo) {
    return shell(`
<style>
  body {
    background-image:
      radial-gradient(78% 88% at 96% 34%, color-mix(in oklab, var(--amber) 20%, transparent) 0%, transparent 60%),
      radial-gradient(75% 70% at 0% 100%, var(--deep) 0%, transparent 72%);
  }
  .logo {
    position: absolute; right: 46px; top: 50%; transform: translateY(-50%);
    width: 420px; height: auto;
    filter: drop-shadow(0 22px 55px rgba(0, 0, 0, 0.5));
  }
  .copy { position: absolute; left: 72px; top: 136px; width: 644px; }
  h1 { margin-top: 18px; font-size: 90px; line-height: 0.98; }
  .rule {
    width: 76px; height: 5px; margin: 26px 0 22px;
    background: var(--amber); border-radius: 999px;
  }
  /* Sized so every line below fits on ONE line. */
  .copy p { font-size: 24px; line-height: 1.55; }
</style>
<img class="logo" src="${logo}" alt="">
<div class="copy">
  <div class="eyebrow mono">IIIF Viewer</div>
  <h1>Triiiceratops</h1>
  <div class="rule"></div>
  <p>First&#8209;class React, Vue and Svelte components.<br>A web component for Django, WordPress, or any&nbsp;HTML.<br>Themeable, configurable, extensible.</p>
</div>
<div class="url mono">${SITE}</div>`);
}

function landingCard(logo) {
    return shell(`
<style>
  body {
    background-image:
      radial-gradient(78% 88% at 96% 34%, color-mix(in oklab, var(--amber) 20%, transparent) 0%, transparent 60%),
      radial-gradient(75% 70% at 0% 100%, var(--deep) 0%, transparent 72%);
  }
  .logo {
    position: absolute; right: 46px; top: 50%; transform: translateY(-50%);
    width: 420px; height: auto;
    filter: drop-shadow(0 22px 55px rgba(0, 0, 0, 0.5));
  }
  .copy { position: absolute; left: 72px; top: 176px; width: 620px; }
  h1 { margin-top: 18px; font-size: 90px; line-height: 0.98; }
  .rule {
    width: 76px; height: 5px; margin: 26px 0 22px;
    background: var(--amber); border-radius: 999px;
  }
</style>
<img class="logo" src="${logo}" alt="">
<div class="copy">
  <div class="eyebrow mono">IIIF Viewer</div>
  <h1>Triiiceratops</h1>
  <div class="rule"></div>
  <p>A modern, lightweight, framework&#8209;agnostic IIIF&nbsp;viewer.</p>
</div>
<div class="url mono">${SITE}</div>`);
}

async function main() {
    const argv = process.argv.slice(2);
    const outIdx = argv.indexOf('--out');
    const outDir = outIdx === -1 ? SOCIAL_DIR : argv[outIdx + 1];
    const chromium = loadChromium();

    mkdirSync(outDir, { recursive: true });
    const logo = dataUri('scripts/social-cards/logo.png');

    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({
            viewport: { width: 1200, height: 630 },
        });
        for (const [name, html] of [
            ['og-docs-v1.png', docsCard(logo)],
            ['og-landing-v1.png', landingCard(logo)],
        ]) {
            await page.setContent(html, { waitUntil: 'load' });
            await page.evaluate(() => document.fonts.ready);
            const file = join(outDir, name);
            writeFileSync(file, await page.screenshot({ type: 'png' }));
            console.log(`social-cards: wrote ${file}`);
        }
    } finally {
        await browser.close();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await main();
}

export { docsCard, landingCard };
