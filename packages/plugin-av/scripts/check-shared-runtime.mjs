#!/usr/bin/env node
// Shared-runtime and chunked-dist gate.
//
// This plugin is the one that bundles neither Svelte nor core's own utilities
// (see vite.config.ts): its
// IIFE reads both off `window.Triiiceratops`. That saving is invisible
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
// Sharing the runtime has a second failure mode, and it is the quiet one: the
// bundle can read a helper core does not publish. `svelte/internal/client` has
// ~200 exports and core curates the handful this plugin's markup reaches, so a
// change that makes the compiler emit any of the rest builds clean, passes unit
// tests — they mount against the REAL `svelte/internal`, not against the
// curated object the browser gets — and then dies at mount with
// `<local>.<helper> is not a function`. So the helpers the built artifacts
// actually reference are compared here against the list core publishes.
//
// `window.Triiiceratops.core` has the same quiet failure mode and gets the same
// scan: a new `import { … } from 'triiiceratops'` anywhere in the IIFE's graph
// builds clean and passes every unit test — unit tests import the real module —
// and then throws in the browser. Every name the artifacts read off that member
// must be published by core AND listed in the plugin's own `REQUIRED_CORE_UTILS`,
// or an old core throws from module scope with no diagnostic ahead of it.
//
// To verify this gate once: drop `svelte` out of `external` in vite.config.ts,
// rebuild, and watch it fail. For the chunk half, drop `chunkedIife()` out of
// the IIFE build's plugin list. For the helper half,
// put a bare text child on a component in `src/Panel.svelte` — `<Button …>x</Button>`
// rather than `<Button …><span>x</span></Button>`: the compiler lowers a bare
// text child of a component to `$.next()`, which core does not publish, and the
// gate then names `next`. For the helper half
// over a chunk, put `window.Triiiceratops.svelteInternal.next()` inside
// `src/waveform/index.ts`. For the core-utils half, add
// `import { normalizeColor } from 'triiiceratops'` to `src/iife.ts` and call it:
// the gate then names `normalizeColor`.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iifePath = join(packageRoot, 'dist', 'iife.js');
const esmPath = join(packageRoot, 'dist', 'index.js');
const sharedRuntimePath = resolve(
    packageRoot,
    '..',
    'core',
    'src',
    'lib',
    'shared-svelte-runtime.ts',
);
const sharedCoreUtilsPath = resolve(
    packageRoot,
    '..',
    'core',
    'src',
    'lib',
    'shared-core-utils.ts',
);
const gateSourcePath = join(packageRoot, 'src', 'sharedRuntimeGate.ts');

/**
 * The helper names core publishes on `window.Triiiceratops.svelteInternal`,
 * read out of the `svelteInternal` object literal in core's source.
 *
 * The source is the authority rather than core's built bundle: the list is
 * written there by hand and minification renames nothing about the property
 * keys, but reading the source also means this gate reports against the list a
 * reviewer can see and edit.
 */
function publishedHelpers() {
    const source = read(sharedRuntimePath, 'core shared-svelte-runtime.ts');
    if (source === null) return null;

    const block = /svelteInternal:\s*\{([\s\S]*?)\n\s{4}\},/.exec(source);
    if (!block) {
        failures.push(
            `Could not find the \`svelteInternal\` object literal in ` +
                `${sharedRuntimePath}: the helper gate has nothing to compare ` +
                `against.`,
        );
        return null;
    }

    // Each entry is `name,` or `name: local,` — the latter only for `if`,
    // which is a reserved word and so cannot be shorthand.
    const names = new Set(
        [...block[1].matchAll(/^\s{8}([A-Za-z_$][\w$]*)\s*[,:]/gm)].map(
            (match) => match[1],
        ),
    );
    if (names.size === 0) {
        failures.push(
            `Parsed no helper names out of ${sharedRuntimePath}: the helper ` +
                `gate has nothing to compare against.`,
        );
        return null;
    }
    return names;
}

/**
 * The utility names core publishes on `window.Triiiceratops.core`, read out of
 * the `SHARED_CORE_UTILS` object literal in core's source.
 *
 * Same authority as `publishedHelpers`, for the same reason: the list is written
 * by hand, minification renames no property key, and reporting against the
 * source means reporting against the list a reviewer can edit.
 */
function publishedCoreUtils() {
    const source = read(sharedCoreUtilsPath, 'core shared-core-utils.ts');
    if (source === null) return null;

    const block = /SHARED_CORE_UTILS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
    if (!block) {
        failures.push(
            `Could not find the \`SHARED_CORE_UTILS\` object literal in ` +
                `${sharedCoreUtilsPath}: the core-utils gate has nothing to ` +
                `compare against.`,
        );
        return null;
    }

    const names = new Set(
        [...block[1].matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*[,:]/gm)].map(
            (match) => match[1],
        ),
    );
    if (names.size === 0) {
        failures.push(
            `Parsed no utility names out of ${sharedCoreUtilsPath}: the ` +
                `core-utils gate has nothing to compare against.`,
        );
        return null;
    }
    return names;
}

/**
 * The names the plugin's own skew gate checks for at load, read out of
 * `REQUIRED_CORE_UTILS` in `src/sharedRuntimeGate.ts`.
 *
 * Core publishing a utility is only half of what makes reading it safe: the gate
 * that runs ahead of the bundle body has to know to look for it, or a core too
 * old to publish it fails with `is not a function` from module scope instead of
 * the named diagnostic. So the built artifacts are held to both lists.
 */
function requiredCoreUtils() {
    const source = read(gateSourcePath, 'src/sharedRuntimeGate.ts');
    if (source === null) return null;

    const block = /REQUIRED_CORE_UTILS[^=]*=\s*\[([\s\S]*?)\];/.exec(source);
    if (!block) {
        failures.push(
            `Could not find the \`REQUIRED_CORE_UTILS\` array in ` +
                `${gateSourcePath}: the core-utils gate cannot tell whether the ` +
                `skew gate covers what the bundle reads.`,
        );
        return null;
    }

    const names = new Set(
        [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
    );
    if (names.size === 0) {
        failures.push(
            `Parsed no utility names out of \`REQUIRED_CORE_UTILS\` in ` +
                `${gateSourcePath}: the core-utils gate has nothing to compare ` +
                `against.`,
        );
        return null;
    }
    return names;
}

/**
 * The locals in a built artifact that hold one member of the
 * `window.Triiiceratops` namespace — `svelteInternal` or `core`.
 *
 * Three ways in, because minification renames every one of them:
 *
 * - the IIFE's parameter. `output.globals` passes the namespace as an argument,
 *   so the binding is positional: the parameter name is read by matching the
 *   `.svelteInternal` argument at the call site against the parameter list.
 *   Both wrapper shapes are accepted (`function(a,b,c){…}` and `(a,b,c)=>{…}`)
 *   and an argument may be parenthesised.
 * - an `x = <obj>.svelteInternal` binding, whether it is a `const`/`let`/`var`
 *   declarator, a later declarator in a comma chain, or a bare assignment. The
 *   comma chain is not hypothetical: `output.intro`'s skew gate holds the
 *   namespace this way, and the minifier folds its binding into one —
 *   `var Xe=de.svelte||{},Ke=de.svelteInternal||{},…` is what ships today. It
 *   is also the only way a CHUNK could hold the namespace, since chunks are
 *   built with nothing external and have no globals wiring, so they would have
 *   to reach for `window.Triiiceratops` in source.
 * - an alias of either: rollup's ESM-interop wrapper (`const r = _interop(x)`)
 *   is what the compiled components actually dereference, and a plain
 *   `const y = x` would do the same job.
 *
 * `ASSIGNED` deliberately forbids `,` `;` and a second `=` between the name and
 * `.svelteInternal`, so that in `var a=1,b=x.svelteInternal` it binds `b` and
 * not `a`; the lookbehind keeps it off `obj.prop = …`.
 */
const ASSIGNED = String.raw`(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?<![=!<>+\-*/%&|^])=(?![=>])\s*`;

/**
 * A minified local, safe to interpolate into a pattern.
 *
 * `$` is legal in an identifier and is the end-of-input anchor in a pattern, so
 * a name the minifier spelled `$e` silently matches nothing at all — and a gate
 * that resolves no locals resolves no helpers, which is the shape of a pass.
 */
function escapeLocal(local) {
    return local.replace(/\$/g, String.raw`\$`);
}

function runtimeLocals(source, member = 'svelteInternal') {
    const locals = new Set();

    const call = /\}\s*\)\s*\(((?:[^()]|\([^()]*\))*)\)\s*;?\s*$/.exec(source);
    const head = /^\(?(?:function\s*)?\(([^)]*)\)/.exec(source);
    if (call && head) {
        const params = head[1].split(',').map((name) => name.trim());
        call[1].split(',').forEach((argument, index) => {
            if (
                new RegExp(String.raw`\.${member}\s*\)*\s*$`).test(argument) &&
                /^[A-Za-z_$][\w$]*$/.test(params[index] ?? '')
            ) {
                locals.add(params[index]);
            }
        });
    }

    for (const match of source.matchAll(
        new RegExp(ASSIGNED + String.raw`[^;,=]*?\.${member}\b`, 'g'),
    )) {
        locals.add(match[1]);
    }

    // Alias fixpoint. Bounded by the number of locals, which is finite.
    //
    // Name-dependent, and knowingly so: the alias pattern is anchored on the
    // local's own name, so a one-character minified local (`e`) would match
    // unrelated `const x=e;` bindings and flood the set with names that never
    // held the namespace. That direction is a noisy FALSE POSITIVE — extra
    // "helpers" reported as unpublished — which a reader can see and dismiss,
    // never a build that references an unpublished helper and passes. It is the
    // safe direction for this gate to be wrong in, so it is left alone.
    for (let added = true; added; ) {
        added = false;
        for (const local of [...locals]) {
            // No terminator is required after the alias: a trailing `,`/`;` is
            // only the minified shape, and end-of-line or `)` is just as valid.
            const alias = new RegExp(
                ASSIGNED +
                    String.raw`(?:[A-Za-z_$][\w$]*\s*\(\s*)?${escapeLocal(local)}\s*\)?(?![\w$.([])`,
                'g',
            );
            for (const match of source.matchAll(alias)) {
                if (!locals.has(match[1])) {
                    locals.add(match[1]);
                    added = true;
                }
            }
        }
    }

    return locals;
}

/**
 * Every helper name an artifact reads off one of those locals.
 *
 * Four access shapes: `x.next`, `x?.next`, `x["next"]` and ``x[`next`]`` — the
 * computed forms because a bundler is free to emit either quoting, and the
 * template literal because leaving it out would be a one-character gap in a form
 * already deliberately supported.
 */
const ACCESS = String.raw`\??\.\s*([A-Za-z_$][\w$]*)|\?\.\s*\[\s*["'\`]([^"'\`]+)["'\`]\s*\]|\[\s*["'\`]([^"'\`]+)["'\`]\s*\]`;

function referencedHelpers(source, member = 'svelteInternal') {
    const referenced = new Set();
    const record = (match) => {
        for (const group of match.slice(1)) if (group) referenced.add(group);
    };
    for (const local of runtimeLocals(source, member)) {
        // A lookbehind rather than `\b`: `\b` needs a word character on one side
        // of the boundary, and a local named `$e` has none.
        //
        // The second lookbehind is the regex-literal exclusion. A minified local
        // can be a single letter that is also a regex flag, so `/<pattern>/i`
        // ends in something shaped exactly like a local and `/…/i.test(x)` would
        // read as a helper named `test`. It is anchored on a whole literal —
        // slash, a body with no unescaped slash and no whitespace, slash, then a
        // flag run — rather than on a bare `/`, because excluding any preceding
        // slash would also discard a genuine `a/e.next()` and that is a false
        // NEGATIVE: an unpublished helper the build then ships (see the safe
        // direction argued in `runtimeLocals`).
        const access = new RegExp(
            String.raw`(?<![\w$.])(?<!\/(?:[^\/\\\n\s]|\\.){1,200}\/[a-z]{0,4})` +
                String.raw`${escapeLocal(local)}\s*(?:${ACCESS})`,
            'g',
        );
        for (const match of source.matchAll(access)) record(match);
        // `const { child, next } = <local>` reaches the same helpers without a
        // member expression ever appearing.
        const destructured = new RegExp(
            String.raw`(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${escapeLocal(local)}(?![\w$])`,
            'g',
        );
        for (const match of source.matchAll(destructured)) {
            for (const entry of match[1].split(',')) {
                const name = /^\s*([A-Za-z_$][\w$]*)/.exec(entry);
                if (name) referenced.add(name[1]);
            }
        }
    }
    // A chunk has no local to resolve at all: with no globals wiring it reads
    // the helper straight off the namespace, `…svelteInternal.next()`.
    for (const match of source.matchAll(
        new RegExp(String.raw`\.${member}\s*(?:${ACCESS})`, 'g'),
    )) {
        record(match);
    }

    // Rollup's interop wrapper defines these on the namespace object itself;
    // they are not runtime helpers and core does not publish them.
    referenced.delete('default');
    return referenced;
}

/**
 * The chunk files an entry actually imports, read out of the entry itself.
 *
 * Derived rather than listed, so that a chunk this script has never heard of
 * still gets inspected: a hard-coded list is a gate that reports green over an
 * artifact it never opened, and the next lazy half added to `vite.config.ts`
 * would ship unexamined. Two specifier shapes, one per format: the ESM entry's
 * relative path, and the IIFE's minified `import(<resolver>("name"))`, which is
 * what `chunkedIife()` rewrites it to. The same derivation as
 * `src/lazy-chunks.guard.test.ts`.
 */
function importedChunks(entry) {
    const names = new Set();
    for (const [, name] of entry.matchAll(
        /import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g,
    )) {
        names.add(name);
    }
    for (const [, name] of entry.matchAll(
        /import\(\s*[A-Za-z_$][\w$]*\(\s*["']([^"'/]+\.js)["']\s*\)\s*\)/g,
    )) {
        names.add(name);
    }
    return [...names];
}

/**
 * The lazy chunks this script knows by name: emitted file name → a string only
 * that chunk's own code can have put in the bundle it appears in.
 *
 * `samples_per_pixel` is a key in the JSON waveform format, read by the
 * parsers; `manifestLoadError` is one of hls.js's own error details; the
 * sequencer's is a phrase from a normalization warning only the segment-map
 * builder can emit. None is reachable from the eager graph, so finding one in the entry means that
 * chunk's bytes have been folded back into it.
 *
 * This map is the inlining detector only. What is CHECKED is the derived list
 * above; a new chunk with no marker here is still enumerated, still fetched by
 * name, and still read by the helper gate — it just has no inlining marker of
 * its own until one is added.
 */
const CHUNK_MARKERS = {
    'av-waveform.js': 'samples_per_pixel',
    'av-hls.js': 'manifestLoadError',
    'av-sequencer.js': 'cannot be placed on the canvas timeline',
    'av-transcript.js': 'tri-av-transcript-cues',
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
    {
        label: 'window.Triiiceratops?.core',
        re: /Triiiceratops\?\.core(?![A-Za-z0-9_$])/,
    },
];

/**
 * Gzip ceiling for the IIFE entry, in bytes.
 *
 * A ratchet a few bytes above the recorded actual, not a budget to spend: it is
 * set from a measurement and moved only by a change that is worth its bytes.
 * Re-derive the actual with `pnpm build`, then gzip `dist/iife.js` at level 9 —
 * the same level this script uses — which currently reads **15,469**. The head
 * over it is ~17 bytes, and can be that tight because this artifact is
 * path-independent. Svelte's scoped-CSS class name is a variable-length hash of
 * the filename the compiler is handed, and that filename is ABSOLUTE — so the
 * hash, and with it the byte count, moves with the checkout directory — only
 * for a component reached through a linked workspace dependency. This package
 * has none: its one component, `src/Panel.svelte`, sits inside the build root
 * and compiles from that package-relative path, so a build in a git worktree
 * and a build on the mainline checkout agree to the byte. Adding a cross-package
 * Svelte component would end that, and the head here would have to grow.
 *
 * The playback chrome is NOT in this number and must never come back into it:
 * core renders it, from the view model `src/transportChrome.ts` registers
 * through `registerTransportChrome`. What this bundle carries of the transport
 * is that view model, its formatting, and the six icon descriptors.
 *
 * What those eager bytes are:
 *
 * - the stage: the lane layout and its styling, the projection's clip to the
 *   overlay container, the companion query core answers, and the tap/pan seam
 *   that keeps a plain-audio canvas draggable;
 * - temporal offsets and the playlist behaviors — the offset seeker, reading
 *   `behavior`, and the end-of-timeline decision. Eager because a manifest
 *   `start`, a chapter's `#t=` and `auto-advance` are all settled on the
 *   navigation that first shows a canvas, and none of them can wait for a chunk;
 * - captions: detecting VTT tracks in both manifest shapes, attaching them as
 *   native `<track>` children, and naming the loaded ones for the track control
 *   core renders;
 * - the HLS playability gate, which decides whether the hls.js chunk is needed
 *   at all and must therefore be in the entry;
 * - Choice selection: the playability probe, the swap that keeps the reader's
 *   place across a rendition change, and the subscription to core's selection
 *   state. About 450 of the total, and eager of necessity — which alternative is
 *   attached is settled while the stage is being built, so nothing here can wait
 *   for a chunk any more than the HLS gate above it can;
 * - the canvas timeline's EAGER half, about 545 bytes: the optional timeline
 *   AVState reads canvas time through, the resume-aware source swap the seam
 *   uses, per-body caption eligibility, the loader that fetches the sequencer
 *   for a canvas whose scan came back temporally composed, the readiness
 *   tri-state that keeps a deep link from being clamped by the first body's
 *   duration while that loader is in flight, and the waveform fence. The
 *   segment map, the seam, the buffered-span mapping and the preloading are
 *   all in the chunk;
 * - the transcript's EAGER half, about 875 bytes: which loaded track the
 *   current canvas's transcript reads, the text track and canvas-time shift it
 *   reads cues through, the `rendering` scan that finds an untimed transcript
 *   file on a canvas carrying no VTT, the answer the control-bar button is
 *   rendered on, and the mount/release of the chunk against the panel's host
 *   node. Both renderers — the cue list with its keyboard behaviour and
 *   scroll-follow, and the untimed file's fetch, paragraph reflow and
 *   fetch-failure link — are in `dist/av-transcript.js`, which is fetched only
 *   for a canvas that actually offers one of them;
 * - the timed manifest annotations' EAGER half, about 350 bytes: the scan that
 *   turns a canvas's `commenting` annotations into timed entries (cookbook
 *   0103), the answer the panel control is rendered on, and the two catalog
 *   strings. Eager because the chunk is built self-contained and so cannot
 *   reach core's `#t=` parser, and because the entries ARE the value handed
 *   across the port; the section that renders them is in the same lazy chunk as
 *   the transcript;
 * - the version-skew gate's diagnostics, and the curator-facing degradation
 *   warnings (user story 45). One cause line each: what failed, the names or URL
 *   involved, the remedy, and a docs pointer. The explanation of why the term
 *   means what it does is in the docs, not in bytes on every page.
 *
 * **The lazy chunks must never enter this number.** `dist/av-waveform.js`
 * (2,584 gzip), `dist/av-sequencer.js` (2,094 gzip), `dist/av-transcript.js`
 * (2,773 gzip) and `dist/av-hls.js` (223,530 gzip) are fetched on demand, and
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
const MAX_IIFE_GZIP = 15_486;

/**
 * Floor on the number of runtime helpers the IIFE entry must be seen to
 * dereference.
 *
 * Not a budget — a self-test. It exists so that a failure to READ the entry
 * cannot present as a clean entry; see where it is used. The entry references 7
 * today (every name core publishes), so this is a floor no plausible markup
 * change reaches, only a broken resolver — which is the reason it sits well
 * below the actual rather than one step under it.
 */
const MIN_ENTRY_HELPERS = 4;

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
                    `what core shares on its namespace and is bundling a ` +
                    `second copy of it instead.`,
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
    const iifeChunks = importedChunks(iife);
    const chunkSources = new Map();
    for (const name of iifeChunks) {
        const chunk = read(join(packageRoot, 'dist', name), `dist/${name}`);
        if (chunk === null) continue;
        chunkSources.set(name, chunk);

        const marker = CHUNK_MARKERS[name];
        if (marker !== undefined) {
            if (!chunk.includes(marker)) {
                failures.push(
                    `dist/${name} does not contain "${marker}", so it is not ` +
                        `the chunk it is named for — the lazy split has moved.`,
                );
            }
            if (iife.includes(marker)) {
                failures.push(
                    `dist/iife.js contains "${marker}", which only dist/${name} ` +
                        `can have put there: that chunk has been inlined back ` +
                        `into the entry.`,
                );
            }
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

    for (const name of Object.keys(CHUNK_MARKERS)) {
        if (!iifeChunks.includes(name)) {
            failures.push(
                `dist/iife.js never imports dist/${name}, so nothing will ever ` +
                    `fetch it: either the lazy split has moved, or the chunk is ` +
                    `now inlined.`,
            );
        }
    }

    // Nothing in `dist` may go unaccounted for. Every `.js` there is either the
    // IIFE entry and a chunk it imports (all inspected below), or the ESM entry
    // and a chunk it imports (deliberately out of this gate's scope — the ESM
    // build leaves Svelte external for the consumer's bundler and reads no
    // globals). A file matching neither is an artifact that ships and that this
    // script has never opened, which is the one thing a gate must not allow.
    const esmChunks = esm === null ? [] : importedChunks(esm);
    const accounted = new Set([
        'iife.js',
        ...iifeChunks,
        'index.js',
        ...esmChunks,
    ]);
    for (const name of readdirSync(join(packageRoot, 'dist'))) {
        if (name.endsWith('.js') && !accounted.has(name)) {
            failures.push(
                `dist/${name} is an artifact no entry imports and this gate ` +
                    `never inspects. Either it is a stale build product that ` +
                    `should not ship, or the entry that fetches it does so in a ` +
                    `shape \`importedChunks\` cannot see.`,
            );
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

    // The helper gate. Every artifact that runs in the page runs against the
    // same globals object, so a chunk reaching for an unpublished helper is
    // exactly as fatal as the entry doing it — and is where a future
    // component's helpers would hide.
    const published = publishedHelpers();
    if (published !== null) {
        // The entry's own resolution has to be asserted, not assumed. Every
        // helper this gate can see is reached through a local that
        // `runtimeLocals` recognised, so a minifier output it cannot parse
        // yields an empty referenced set — no helper missing, and a green line
        // indistinguishable from a clean bundle. Both halves are checked: that
        // SOMETHING resolved, and that what resolved is the whole compiled
        // graph rather than one stray binding. The entry references 7 helpers
        // today; the floor is set well under that so ordinary markup churn
        // never touches it, and a collapse to a stray binding is what it
        // catches.
        const entryLocals = runtimeLocals(iife);
        const entryHelpers = referencedHelpers(iife);
        if (entryLocals.size === 0) {
            failures.push(
                `Found no local holding window.Triiiceratops.svelteInternal in ` +
                    `dist/iife.js, so the helper gate inspected nothing there. ` +
                    `The minifier has emitted a binding shape \`runtimeLocals\` ` +
                    `does not recognise — widen it rather than trusting this run.`,
            );
        } else if (entryHelpers.size < MIN_ENTRY_HELPERS) {
            failures.push(
                `dist/iife.js resolves only ${entryHelpers.size} runtime ` +
                    `helpers (expected at least ${MIN_ENTRY_HELPERS}); the ` +
                    `compiled components dereference far more than that. The ` +
                    `helper gate is reading the entry wrongly, so its silence ` +
                    `means nothing.`,
            );
        }

        const artifacts = ['iife.js', ...iifeChunks];
        let checked = 0;
        for (const name of artifacts) {
            const artifact = name === 'iife.js' ? iife : chunkSources.get(name);
            if (artifact === undefined) continue;

            const missing = [...referencedHelpers(artifact)]
                .filter((helper) => !published.has(helper))
                .sort();
            checked += 1;
            if (missing.length > 0) {
                failures.push(
                    `dist/${name} reads ${missing.map((helper) => `\`${helper}\``).join(', ')} ` +
                        `off window.Triiiceratops.svelteInternal, which core does not ` +
                        `publish: this throws "is not a function" at mount in a browser, ` +
                        `and no unit test can see it. Either change the markup so the ` +
                        `compiler stops emitting the helper, or add it to ` +
                        `SHARED_SVELTE_RUNTIME in packages/core/src/lib/` +
                        `shared-svelte-runtime.ts and accept the core size ratchet.`,
                );
            }
        }
        if (checked < artifacts.length) {
            failures.push(
                `Read ${checked} of ${artifacts.length} IIFE-side artifacts ` +
                    `(${artifacts.join(', ')}): the helper gate cannot report ` +
                    `on one it could not open.`,
            );
        } else if (failures.length === 0) {
            // Named, not counted: the number is only worth printing if a reader
            // can check it against the files the gate actually opened.
            console.log(
                `check-shared-runtime: ${checked} artifacts reference only ` +
                    `helpers core publishes (${published.size} available) — ` +
                    `${artifacts.map((name) => `dist/${name}`).join(', ')}.`,
            );
        }
    }

    // The core-utils gate, the exact counterpart of the helper gate above and
    // for the exact same failure mode. `window.Triiiceratops.core` is curated
    // too, so a module that imports a fifth function from `triiiceratops` builds
    // clean, passes every unit test — unit tests import the REAL module, not the
    // curated object the browser gets — registers, and then dies with
    // "is not a function". Both lists have to hold: core must publish the name,
    // and the skew gate must require it, or an OLD core produces the same throw
    // from module scope with no diagnostic ahead of it.
    const publishedUtils = publishedCoreUtils();
    const requiredUtils = requiredCoreUtils();
    if (publishedUtils !== null && requiredUtils !== null) {
        const artifacts = ['iife.js', ...iifeChunks];
        if (runtimeLocals(iife, 'core').size === 0) {
            failures.push(
                `Found no local holding window.Triiiceratops.core in ` +
                    `dist/iife.js, so the core-utils gate inspected nothing ` +
                    `there. The minifier has emitted a binding shape ` +
                    `\`runtimeLocals\` does not recognise — widen it rather ` +
                    `than trusting this run.`,
            );
        }
        for (const name of artifacts) {
            const artifact = name === 'iife.js' ? iife : chunkSources.get(name);
            if (artifact === undefined) continue;

            const utils = [...referencedHelpers(artifact, 'core')].sort();
            const unpublished = utils.filter(
                (util) => !publishedUtils.has(util),
            );
            const ungated = utils.filter(
                (util) => publishedUtils.has(util) && !requiredUtils.has(util),
            );
            if (unpublished.length > 0) {
                failures.push(
                    `dist/${name} reads ${unpublished.map((util) => `\`${util}\``).join(', ')} ` +
                        `off window.Triiiceratops.core, which core does not publish: ` +
                        `this throws "is not a function" in a browser, and no unit ` +
                        `test can see it. Either stop importing it from ` +
                        `\`triiiceratops\` in the IIFE's graph, or add it to ` +
                        `SHARED_CORE_UTILS in packages/core/src/lib/` +
                        `shared-core-utils.ts and accept the core size ratchet.`,
                );
            }
            if (ungated.length > 0) {
                failures.push(
                    `dist/${name} reads ${ungated.map((util) => `\`${util}\``).join(', ')} ` +
                        `off window.Triiiceratops.core without REQUIRED_CORE_UTILS ` +
                        `in src/sharedRuntimeGate.ts listing them: against an ` +
                        `older core the skew gate would pass and the bundle would ` +
                        `then throw "is not a function" from module scope with ` +
                        `nothing to say why. Add them to REQUIRED_CORE_UTILS.`,
                );
            }
        }
        if (failures.length === 0) {
            console.log(
                `check-shared-runtime: ${artifacts.length} artifacts read only ` +
                    `core utilities that core publishes (${publishedUtils.size} ` +
                    `available) and that the skew gate requires ` +
                    `(${requiredUtils.size} listed).`,
            );
        }
    }

    const gzip = gzipSync(Buffer.from(iife), { level: 9 }).length;
    if (gzip > MAX_IIFE_GZIP) {
        failures.push(
            `dist/iife.js is ${gzip} bytes gzip, over the ${MAX_IIFE_GZIP} ceiling. ` +
                `Check, in rough order of how much they would move it: whether a ` +
                `lazy chunk has been folded back into the entry (the markers ` +
                `above catch that outright), whether an import has defeated one ` +
                `of the externals and pulled in a second Svelte runtime or a ` +
                `second copy of core's utilities, and whether eager code has ` +
                `grown that belongs behind a chunk. If the growth is real and ` +
                `worth its bytes, raise this ceiling deliberately and re-check ` +
                `the pair budget in scripts/size-check.mjs.`,
        );
    } else if (failures.length === 0) {
        console.log(
            `check-shared-runtime: dist/iife.js ${gzip} bytes gzip ` +
                `(ceiling ${MAX_IIFE_GZIP}), no bundled Svelte runtime, all ` +
                `shared globals read, skew gate present.`,
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
