#!/usr/bin/env node
// Render the two social-preview ("Open Graph") card images.
//
// The cards are COMMITTED PNGs under docs/media/social/ — nothing in CI runs
// this script. It exists so the cards stay editable source rather than opaque
// binaries: change the HTML below, re-run, commit the result.
//
//   node scripts/social-cards.mjs               # re-render both cards
//   node scripts/social-cards.mjs --out /tmp/x  # render elsewhere (preview)
//   node scripts/social-cards.mjs --capture     # also re-shoot the viewer image
//
// Two cards, not one, because the two URLs make different promises: the docs
// root says "read about this library", /viewer/ says "click and it runs". A
// shared card would undersell whichever one it wasn't written for.
//
// FILENAMES ARE VERSIONED (`-v1`) ON PURPOSE. Facebook, LinkedIn and Slack
// cache preview images by URL for days-to-weeks with no reliable purge, so a
// card is effectively immutable once shared. To change a card, bump the
// filename to `-v2` here AND at every reference listed in scripts/social-cards.README.md.
//
// Requires Playwright's Chromium (a devDependency of packages/core) and network
// access for the Inter webfont — the same font the docs site loads. Without the
// network it falls back to a system sans and the cards render slightly off.

import {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { REPO_ROOT } from './docs-version.mjs';

const SITE = 'd-flood.github.io/triiiceratops';
const SOCIAL_DIR = join(REPO_ROOT, 'docs', 'media', 'social');
// The captured viewer screenshot the demo card is composed from. Deliberately
// NOT under docs/: everything in docs/ is copied into the built site and then
// into every published version directory, and this is build input, not a site
// asset — it would ship ~1.4 MB per release for nothing.
const SHOT = 'scripts/social-cards/viewer-dark.jpg';
// Wheel-zoom steps applied before capture. Enough that the manuscript fills the
// frame, few enough that its silhouette still reads as a fragment rather than
// as brown texture. See captureViewer().
// Zoom clicks (the viewer steps by 1.2x each) applied before capture. Five is
// where the calibration chart, which sits right against the fragment on the
// plate, finally falls outside the frame. That necessarily crops the fragment's
// top and bottom — unavoidable, and it still reads as a manuscript.
const ZOOM_STEPS = 5;
// The demo layout preset to capture, by its button label in SettingsMenu.svelte.
const LAYOUT_PRESET = 'Unified bar';
// The viewer's own collapse control, by aria-label (messages/en.json
// `close_menu`). Collapses the unified bar's tool row back to a menu button.
const CLOSE_MENU_LABEL = 'Close Menu';

// The docs theme tokens, copied from docs/stylesheets/triiiceratops.css so the
// cards read as part of the same product as the site they link to.
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

/** Shared page chrome: 1200x630 exactly, no scrollbars, brand tokens in scope. */
function shell(body) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@500;700&display=block">
<style>
  :root {
    --navy: ${NAVY}; --deep: ${DEEP}; --amber: ${AMBER};
    --amber-ink: ${AMBER_INK}; --paper: ${PAPER};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: Inter, system-ui, sans-serif;
    background: var(--navy);
    color: var(--paper);
    position: relative;
    background-image:
      radial-gradient(75% 70% at 0% 100%, var(--deep) 0%, transparent 72%);
  }
  .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
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
 * Viewer card: the demo card. Real pixels from the real viewer on the right,
 * because "this actually runs" is the whole claim — a logo cannot make it.
 *
 * ONE screenshot, dark theme. A light/dark pair was tried and dropped: at the
 * zoom that makes the manuscript legible, the viewer's chrome is cropped out
 * entirely, so the two themes render identical cards. Open Graph has no theme
 * negotiation either — one image serves every viewer in every app regardless of
 * the theme they are using — so there is nothing a second shot could buy.
 */
function viewerCard(logo, shot) {
    return shell(`
<style>
  /* The viewer framed as a window rather than bled to the card edge. The frame's
     aspect ratio matches the capture's exactly (950x1260), so nothing is cropped:
     the toolbar rail and the page controls both stay whole. A part-cropped rail
     reads as a mistake; the complete UI reads as "this is the app". */
  .frame {
    position: absolute; right: 62px; top: 34px; width: 424px; height: 562px;
    border-radius: 14px; overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--paper) 14%, transparent);
    box-shadow: 0 28px 68px rgba(0, 0, 0, 0.55);
  }
  .frame img { display: block; width: 100%; height: 100%; object-fit: fill; }
  .copy { position: absolute; left: 72px; top: 186px; width: 540px; }
  .pill {
    display: inline-block; padding: 9px 21px 10px; border-radius: 999px;
    background: var(--amber); color: var(--amber-ink);
    font-size: 20px; font-weight: 700; letter-spacing: 0.17em;
    text-transform: uppercase;
  }
  h1 { margin-top: 24px; font-size: 82px; line-height: 1.0; }
  .copy p { margin-top: 20px; width: 470px; }
  .mark {
    position: absolute; left: 72px; top: 92px; width: 104px; height: auto;
  }
</style>
<div class="frame"><img src="${shot}" alt=""></div>
<img class="mark" src="${logo}" alt="">
<div class="copy">
  <div class="pill mono">Live demo</div>
  <h1>Triiiceratops</h1>
  <p>Open any IIIF manifest.</p>
</div>
<div class="url mono">${SITE}<b>/viewer/</b></div>`);
}

// ---------------------------------------------------------------------------
// --capture: re-shoot the viewer image used by the demo card
// ---------------------------------------------------------------------------

// The manifest the docs already showcase (see docs/index.md), so the card shows
// what a visitor sees when they follow it.
const DEMO_MANIFEST =
    'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/';
const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

/** Serve the built demo over http:// — file:// breaks its module imports. */
function serveViewer(root) {
    const server = createServer((req, res) => {
        let p = join(root, decodeURIComponent(req.url.split('?')[0]));
        if (existsSync(p) && statSync(p).isDirectory())
            p = join(p, 'index.html');
        if (!existsSync(p)) {
            res.writeHead(404).end('not found');
            return;
        }
        res.writeHead(200, {
            'content-type': MIME[extname(p)] ?? 'application/octet-stream',
        });
        res.end(readFileSync(p));
    });
    return new Promise((resolve) => {
        server.listen(0, () =>
            resolve({ server, port: server.address().port }),
        );
    });
}

/**
 * Capture the viewer, dark theme, its own demo scaffolding stripped, cropped
 * past the toolbar rail (a dark strip of dots at card scale, and it ghosts
 * through the card's seam gradient). Written at ~2x the card's image slot so it
 * stays sharp on retina.
 */
async function captureViewer(chromium) {
    const root = join(REPO_ROOT, 'docs', 'viewer');
    if (!existsSync(join(root, 'index.html'))) {
        throw new Error(
            `--capture needs the built demo at docs/viewer/. Run \`pnpm build:demo\` first.`,
        );
    }
    const { server, port } = await serveViewer(root);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({
            // Wide to start: the demo's configuration pane has to be on screen to
            // click a layout preset. Switched to the portrait capture viewport
            // below. The demo reads prefers-color-scheme for its initial theme, so
            // `colorScheme` is all it takes to get the dark viewer.
            viewport: { width: 1600, height: 1000 },
            colorScheme: 'dark',
        });
        await page.goto(
            `http://localhost:${port}/?manifest=${encodeURIComponent(DEMO_MANIFEST)}`,
            { waitUntil: 'load' },
        );
        await page.waitForTimeout(6000);

        // The "Unified bar" layout preset (see SettingsMenu.svelte): one docked
        // bar with the tools, zoom and paging in it, and no vertical rail. It
        // survives a narrow crop better than the default docked rail, which needs
        // the full height of the frame to make sense.
        await page
            .getByRole('button', { name: LAYOUT_PRESET, exact: true })
            .first()
            .click();
        await page.waitForTimeout(1500);
        // The `unified` preset opens the toolbar, which fills the bar with every
        // tool icon. Collapse it back to the menu button: at card scale a row of
        // twelve 12px icons is visual noise, and the collapsed bar is the viewer's
        // resting state — what a visitor actually lands on.
        await page
            .getByRole('button', { name: CLOSE_MENU_LABEL, exact: true })
            .first()
            .click();
        await page.waitForTimeout(1000);

        await page.setViewportSize({ width: 1152, height: 1260 });
        await page.waitForTimeout(1500);
        await page.addStyleTag({
            content: `
                .demo-root > header, .demo-header, .demo-title { display: none !important; }
                .config-panel, .viewer-config, aside { display: none !important; }
                .viewer-main { padding: 0 !important; margin: 0 !important; }
                .viewer-layout { display: block !important; gap: 0 !important; }
                .viewer-pane {
                    width: 100vw !important; height: 100vh !important;
                    max-width: none !important; border: 0 !important;
                    border-radius: 0 !important;
                }
                html, body, .demo-root {
                    margin: 0 !important; padding: 0 !important;
                    overflow: hidden !important; height: 100vh !important;
                }
            `,
        });
        // Let the renderer's debounced resize refit finish before zooming:
        // restyling `.viewer-pane` above changed the viewport size, and the refit
        // would otherwise undo the zoom.
        await page.waitForTimeout(3000);

        // Zoom in on the manuscript itself. Fit-to-canvas framing includes the
        // photographic surround — mount board, and on the CSNTM plates a
        // MegaVision colour-calibration chart — which reads as lab equipment at
        // card size.
        //
        // The viewer's own Zoom In button, not synthetic wheel events over the
        // canvas: the renderer's resize refit lands after those and discards
        // them, so the plate stays at fit-to-canvas no matter how long we wait.
        const zoomIn = page.getByRole('button', {
            name: 'Zoom In',
            exact: true,
        });
        for (let i = 0; i < ZOOM_STEPS; i++) {
            await zoomIn.first().click();
            await page.waitForTimeout(700);
        }
        // Let the renderer settle on the higher-resolution tiles.
        await page.waitForTimeout(6000);
        const file = join(REPO_ROOT, SHOT);
        mkdirSync(join(REPO_ROOT, 'scripts', 'social-cards'), {
            recursive: true,
        });
        writeFileSync(
            file,
            await page.screenshot({
                // JPEG, not PNG: this is a photograph of a manuscript, and PNG
                // stores one at roughly eight times the size for no visible gain.
                // The cards themselves are still PNG.
                type: 'jpeg',
                quality: 92,
                // Centred on the 1152px-wide viewport so the docked bar stays
                // centred in the crop, and narrow enough to stop short of the
                // colour-calibration chart at the right of the plate.
                clip: { x: 101, y: 0, width: 950, height: 1260 },
            }),
        );
        console.log(`social-cards: captured ${file}`);
    } finally {
        await browser.close();
        server.close();
    }
}

async function main() {
    const argv = process.argv.slice(2);
    const outIdx = argv.indexOf('--out');
    const outDir = outIdx === -1 ? SOCIAL_DIR : argv[outIdx + 1];
    const chromium = loadChromium();

    if (argv.includes('--capture')) await captureViewer(chromium);

    mkdirSync(outDir, { recursive: true });
    const logo = dataUri('docs/media/logo.png');
    const shot = dataUri(SHOT);

    const browser = await chromium.launch();
    try {
        // deviceScaleFactor 1 at exactly 1200x630: the size every platform
        // wants, and small enough to stay well under Twitter's 5 MB card limit.
        const page = await browser.newPage({
            viewport: { width: 1200, height: 630 },
        });
        for (const [name, html] of [
            ['og-docs-v1.png', docsCard(logo)],
            ['og-viewer-v1.png', viewerCard(logo, shot)],
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

export { docsCard, viewerCard };
