#!/usr/bin/env node
// Shared-Svelte-runtime dist gate.
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
// To verify this gate once: drop `svelte` out of `external` in vite.config.ts,
// rebuild, and watch it fail.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iifePath = join(packageRoot, 'dist', 'iife.js');
const esmPath = join(packageRoot, 'dist', 'index.js');

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
 * Gzip ceiling for the IIFE, in bytes.
 *
 * A ratchet on the recorded actual, not a budget to spend. Raised deliberately
 * four times: the build that introduced the shared runtime (7,782), the
 * version-skew gate's ~700 gzip of diagnostic prose (8,480), the transport
 * (14,892) — whose weight is mostly `@triiiceratops/ui`'s `Button` and `Range`,
 * bundled here because the transport must inherit the viewer's theming rather
 * than carry a parallel stylesheet — and the stage layout (16,565), which added
 * the lanes, their styling, companion-canvas resolution, the tap/pan seam that
 * keeps a plain-audio canvas draggable, and deferring the companion request
 * until the canvas is laid out so it is sized to the lane rather than the
 * source asset.
 *
 * Note what this number no longer discriminates: a bundled Svelte runtime is
 * ~13 KB gzip, so the ceiling is now past the thing it was first set to catch.
 * The runtime fingerprints and required globals above are what actually detect
 * that, and they are exact rather than statistical. The real ceiling on total
 * weight is the competitive pair budget in `scripts/size-check.mjs`.
 */
const MAX_IIFE_GZIP = 16_600;

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
