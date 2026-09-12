#!/usr/bin/env node
// Render the social-preview ("Open Graph") card images.
//
// The cards are COMMITTED PNGs under apps/site/static/social/ — nothing in CI runs
// this script. It exists so the cards stay editable source rather than opaque
// binaries: change the HTML below, re-run, commit the result.
//
//   node scripts/social-cards.mjs               # re-render every card
//   node scripts/social-cards.mjs --out /tmp/x  # render elsewhere (preview)
//
// One card per promise, rather than one card for the site: the landing page says
// "here is what this is" and the docs root says "read about this library". A
// shared card would undersell whichever URL it wasn't written for.
//
// FILENAMES ARE VERSIONED (`-v1`) ON PURPOSE. Facebook, LinkedIn and Slack
// cache preview images by URL for days-to-weeks with no reliable purge, so a
// card is effectively immutable once shared. To change a card, bump the
// filename to `-v2` here AND at every reference listed in scripts/social-cards.README.md.
//
// Requires Playwright's Chromium (a devDependency of packages/core) and nothing
// else: the two faces are the repository's own self-hosted ones, embedded as data
// URIs, so a render is hermetic and reproducible rather than dependent on a font
// host being up.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const SITE = 'triiiceratops.org';
const SOCIAL_DIR = join(REPO_ROOT, 'apps', 'site', 'static', 'social');

// The viewer's own dark theme, so the cards read as part of the same product as
// the site they link to.
const NAVY = 'oklch(25.33% 0.016 252.42)'; // --tri-viewer-bg (slate)
const DEEP = 'oklch(17.5% 0.012 254.09)'; // --tri-surface-border (slate)
const AMBER = 'oklch(78% 0.15 80)'; // --tri-primary
const AMBER_INK = 'oklch(28% 0.08 70)'; // --tri-primary-content
const PAPER = 'oklch(97.807% 0.029 256.847)'; // --tri-content (slate)

/**
 * Playwright is a devDependency of packages/core, not of the root, so resolve
 * it from there rather than assuming a hoisted install.
 */
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

/** Inline an image as a data URI — the render must not depend on file:// paths. */
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

/**
 * The faces a card is set in, embedded.
 *
 * A card is a committed PNG, so the render has to be reproducible: a webfont
 * fetched from a third party makes the output depend on a host being up and on
 * whatever that host is serving today. These are the same files the marketing
 * site and the documentation serve, so a card reads as part of the same product.
 */
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

/** Shared page chrome: 1200x630 exactly, no scrollbars, brand tokens in scope. */
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
  /* A card is read at thumbnail size; the eyebrow has to survive that. */
  .eyebrow {
    font-size: 22px; font-weight: 700; letter-spacing: 0.2em;
    color: var(--amber); text-transform: uppercase;
  }
  h1 { font-weight: 800; letter-spacing: -0.034em; }
  p {
    font-size: 29px; line-height: 1.38; font-weight: 400;
    color: color-mix(in oklab, var(--paper) 80%, transparent);
  }
  /* The one line every card ends on: where this image will take you. */
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

/**
 * Docs card: the wordmark card. The logo sits whole on the right — it is a
 * recognizable animal only while its head and frill are intact, so this one
 * does not bleed off the edge.
 */
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
  /* Three short lines rather than a sentence: each carries one claim, and at the
     size a card is actually viewed, scannable beats grammatical. Line two names
     two stacks by name on purpose: a Django or WordPress developer recognises
     them instantly, where "server-rendered HTML" has to be translated first, and
     "framework-agnostic" reads as "you can probably make it work" — which
     undersells a real custom element. "or any HTML" is what keeps the two names
     reading as examples rather than as the limit of what is supported. */
  /* Sized so every line below fits on ONE line — the structure is the point. */
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

/**
 * Landing card: the site root. This is the URL an announcement post carries, so
 * it says the one sentence the landing page says and nothing more — the docs
 * card's three claims are for a reader who already followed a link.
 */
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
        // deviceScaleFactor 1 at exactly 1200x630: the size every platform
        // wants, and small enough to stay well under Twitter's 5 MB card limit.
        const page = await browser.newPage({
            viewport: { width: 1200, height: 630 },
        });
        for (const [name, html] of [
            ['og-docs-v1.png', docsCard(logo)],
            ['og-landing-v1.png', landingCard(logo)],
        ]) {
            await page.setContent(html, { waitUntil: 'load' });
            // `display=block` on the font request means text is invisible until
            // the webfont lands; screenshotting before that yields blank copy.
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
