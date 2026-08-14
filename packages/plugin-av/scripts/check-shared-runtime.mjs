#!/usr/bin/env node
// Shared-Svelte-runtime and chunked-dist gate.
//
// This plugin is the one that does NOT bundle Svelte (see vite.config.ts): its
// IIFE reads core's runtime off `window.Triiiceratops`. That saving is invisible
// in source and easy to lose — a stray import that defeats the external, a
// config edit, a Vite upgrade that stops honouring `rollupOptions.output.globals`
// — and it would be lost silently, because a bundle carrying its own runtime
// works perfectly well. It just costs every page ~12 KB gzip it need not.
//
// So the built artifacts are inspected here, after the build, the way core's own
// `check:element-artifact` inspects its element bundle.
//
// The same reasoning covers this plugin's OTHER deviation, the multi-file dist:
// the entry's lazy halves live in sibling chunks, and an entry that quietly
// swallowed one of them would also work perfectly well — it would just cost
// every page hundreds of kilobytes of hls.js it need not. So the chunks are
// checked for here too: present, referenced, free of the entry's markers and,
// like the entry, free of a Svelte runtime of their own (they are built with
// nothing external, so a stray Svelte import lands in them rather than failing).
//
// To verify this gate once: drop `svelte` out of `external` in vite.config.ts,
// rebuild, and watch it fail. For the chunk half, drop `chunkedIife()` out of
// the IIFE build's plugin list.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iifePath = join(packageRoot, 'dist', 'iife.js');
const esmPath = join(packageRoot, 'dist', 'index.js');

/**
 * The IIFE's lazy chunks: emitted file name → a string only that chunk's own
 * code can have put in the bundle it appears in.
 *
 * `samples_per_pixel` is a key in the JSON waveform format, read by the
 * parsers; `manifestLoadError` is one of hls.js's own error details. Neither is
 * reachable from the eager graph, so finding one in the entry means that
 * chunk's bytes have been folded back into it.
 */
const LAZY_CHUNKS = {
    'av-waveform.js': 'samples_per_pixel',
    'av-hls.js': 'manifestLoadError',
};

/**
 * Error codes minified out of nothing: they are string literals inside Svelte 5's
 * client runtime, so they survive minification and appear in every plugin bundle
 * that carries a copy of it. Both sibling plugin IIFEs contain all three; this
 * one must contain none.
 */
const BUNDLED_RUNTIME_FINGERPRINTS = [
    'effect_update_depth_exceeded',
    'lifecycle_outside_component',
    'state_unsafe_mutation',
];

/**
 * Where the IIFE must read the runtime from, per `output.globals`.
 *
 * Matched with a trailing boundary rather than as plain substrings: `.svelte` is
 * a prefix of `.svelteInternal`, so a substring test for the first passes on any
 * bundle that satisfies the second, and a build that stopped emitting the
 * `mount`/`unmount` global would sail through the gate that exists to catch it.
 */
const REQUIRED_GLOBALS = [
    {
        label: 'window.Triiiceratops?.svelte',
        re: /Triiiceratops\?\.svelte(?![A-Za-z0-9_$])/,
    },
    {
        label: 'window.Triiiceratops?.svelteInternal',
        re: /Triiiceratops\?\.svelteInternal(?![A-Za-z0-9_$])/,
    },
];

/**
 * Gzip ceiling for the IIFE entry, in bytes.
 *
 * A ratchet a few bytes above the recorded actual, not a budget to spend: it is
 * set from a measurement and moved only by a change that is worth its bytes.
 * Re-derive the actual with `pnpm build`, then gzip `dist/iife.js` at level 9 —
 * the same level this script uses — which currently reads **20,970**.
 *
 * What those eager bytes are:
 *
 * - the transport, mostly `@triiiceratops/ui`'s `Button` and `Range`, bundled
 *   here so the chrome inherits the viewer's theming instead of carrying a
 *   parallel stylesheet — by some way the largest single item;
 * - the stage: the lane layout and its styling, the projection's clip to the
 *   overlay container, companion-canvas resolution, and the tap/pan seam that
 *   keeps a plain-audio canvas draggable;
 * - temporal offsets and the playlist behaviors — the offset seeker, reading
 *   `behavior`, and the end-of-timeline decision. Eager because a manifest
 *   `start`, a chapter's `#t=` and `auto-advance` are all settled on the
 *   navigation that first shows a canvas, and none of them can wait for a chunk;
 * - captions: detecting VTT tracks in both manifest shapes, attaching them as
 *   native `<track>` children, and the transport's toggle. About 750 of the
 *   total is the multi-track radio list alone — its markup, its keyboard
 *   behaviour and its styling — which is what a reader choosing a language
 *   costs over a reader turning one track on and off;
 * - the HLS playability gate, which decides whether the hls.js chunk is needed
 *   at all and must therefore be in the entry;
 * - the version-skew gate's diagnostic prose, and the curator-facing degradation
 *   warnings (user story 45). Their prose is a real share of this number and is
 *   spent deliberately: a message that says what was ignored and what the term
 *   actually means costs a few hundred bytes more than one that says "ignored".
 *
 * **The lazy chunks must never enter this number.** `dist/av-waveform.js`
 * (2,584 gzip) and `dist/av-hls.js` (223,530 gzip) are fetched on demand, and
 * the marker checks below are what prove they are still out. A chunk folded back
 * into the entry would show up here as a jump of roughly its standalone size
 * less what the minifier saves by sharing scope — for the waveform that was
 * about 1,755 rather than its full 2,584 — so this ceiling alone is not a
 * reliable detector of it, and the markers are.
 *
 * Nor does this number discriminate a bundled Svelte runtime any more: that is
 * ~13 KB gzip and the ceiling is long past it. The runtime fingerprints and
 * required globals above detect that exactly. The real ceiling on total shipped
 * weight is the competitive pair budget in `scripts/size-check.mjs`.
 */
const MAX_IIFE_GZIP = 21_000;

const failures = [];

function read(path, label) {
    if (!existsSync(path)) {
        failures.push(
            `${label} is missing (${path}). Run \`pnpm build\` first.`,
        );
        return null;
    }
    return readFileSync(path, 'utf8');
}

const iife = read(iifePath, 'dist/iife.js');
const esm = read(esmPath, 'dist/index.js');

if (iife !== null) {
    for (const fingerprint of BUNDLED_RUNTIME_FINGERPRINTS) {
        if (iife.includes(fingerprint)) {
            failures.push(
                `dist/iife.js contains "${fingerprint}", a Svelte client-runtime ` +
                    `string: the runtime is bundled in rather than shared with core.`,
            );
        }
    }

    for (const { label, re } of REQUIRED_GLOBALS) {
        if (!re.test(iife)) {
            failures.push(
                `dist/iife.js never reads \`${label}\`, so it is not consuming ` +
                    `core's shared Svelte runtime.`,
            );
        }
    }

    // The version-skew gate (src/sharedRuntimeGate.ts) is emitted through
    // `output.intro`, which is easy to lose to a config edit and invisible in
    // source. Without it the bundle throws a bare ReferenceError/TypeError on a
    // page whose core is absent or too old, ahead of any registration.
    if (!iife.includes('@triiiceratops/plugin-av did not register')) {
        failures.push(
            `dist/iife.js carries no shared-runtime skew gate: a page loading it ` +
                `without a compatible core would throw instead of reporting why.`,
        );
    }

    // The chunked dist. Each lazy half must exist beside the entry, be fetched
    // by name from it, and be absent FROM it.
    for (const [name, marker] of Object.entries(LAZY_CHUNKS)) {
        const chunk = read(join(packageRoot, 'dist', name), `dist/${name}`);
        if (chunk === null) continue;

        if (!chunk.includes(marker)) {
            failures.push(
                `dist/${name} does not contain "${marker}", so it is not the ` +
                    `chunk it is named for — the lazy split has moved.`,
            );
        }
        if (iife.includes(marker)) {
            failures.push(
                `dist/iife.js contains "${marker}", which only dist/${name} ` +
                    `can have put there: that chunk has been inlined back into ` +
                    `the entry.`,
            );
        }
        if (!iife.includes(`"${name}"`) && !iife.includes(`'${name}'`)) {
            failures.push(
                `dist/iife.js never names dist/${name}, so nothing will ever ` +
                    `fetch it.`,
            );
        }
        for (const fingerprint of BUNDLED_RUNTIME_FINGERPRINTS) {
            if (chunk.includes(fingerprint)) {
                failures.push(
                    `dist/${name} contains "${fingerprint}": a chunk is built ` +
                        `with nothing external, so a Svelte import inside one ` +
                        `bundles a second runtime rather than sharing core's.`,
                );
            }
        }
    }

    // The resolver the rewritten `import()` calls. Without it the specifiers
    // above resolve against the PAGE rather than against the plugin's own
    // script URL, and every chunk 404s on any page not served from the dist
    // directory's own path.
    if (!iife.includes('document.currentScript')) {
        failures.push(
            `dist/iife.js never reads \`document.currentScript\`, so it cannot ` +
                `resolve its chunks against its own script URL.`,
        );
    }

    const gzip = gzipSync(Buffer.from(iife), { level: 9 }).length;
    if (gzip > MAX_IIFE_GZIP) {
        failures.push(
            `dist/iife.js is ${gzip} bytes gzip, over the ${MAX_IIFE_GZIP} ceiling. ` +
                `Check whether it has acquired a bundled Svelte runtime.`,
        );
    } else if (failures.length === 0) {
        console.log(
            `check-shared-runtime: dist/iife.js ${gzip} bytes gzip ` +
                `(ceiling ${MAX_IIFE_GZIP}), no bundled Svelte runtime, both ` +
                `globals read, skew gate present.`,
        );
    }
}

if (esm !== null && !/from\s*["']svelte(\/[^"']*)?["']/.test(esm)) {
    failures.push(
        `dist/index.js imports nothing from "svelte": the ESM build must leave ` +
            `Svelte external so a consumer's bundler dedupes it against core's.`,
    );
}

if (failures.length > 0) {
    console.error('check-shared-runtime FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
