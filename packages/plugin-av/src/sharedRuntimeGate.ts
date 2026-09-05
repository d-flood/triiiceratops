/**
 * The IIFE's **version-skew gate**: the check that runs before any of this
 * plugin's code does.
 *
 * This plugin bundles neither Svelte nor core's own utilities; its compiled
 * components call helpers off `window.Triiiceratops.svelteInternal` and its
 * modules read five functions off `window.Triiiceratops.core` (see
 * `vite.config.ts`). Those references
 * happen at MODULE scope — a compiled component's `$.from_html(...)` template
 * constant is evaluated when the script is evaluated — so by the time
 * `definePlugin`'s `coreRange` / `pluginApiRange` / `requiredCapabilities`
 * negotiation could refuse an incompatible core, the bundle has already thrown.
 * A page with no core got `ReferenceError: Triiiceratops is not defined`; a core
 * too old to share its runtime got `TypeError: s.from_html is not a function`.
 * Neither names the cause, and both beat registration, so the host's
 * `plugins.get('@triiiceratops/plugin-av')` came back `undefined` with nothing
 * to explain why.
 *
 * So the gate is emitted AHEAD of the bundle body, as
 * `rollupOptions.output.intro` — the one position that is inside the IIFE (so it
 * can `return`) and before the first module statement. It names the actual cause
 * and returns without registering. The globals are mapped through optional
 * chaining for the same reason: the IIFE's ARGUMENTS are evaluated before its
 * body, so a bare `Triiiceratops.svelteInternal` there throws before the gate
 * can run.
 *
 * The gate covers "core is absent, or shares a runtime this plugin cannot use".
 * The matching "core is present but declares no shared runtime at all" case is
 * negotiated normally, by the `shared-svelte-runtime` capability this plugin
 * requires — see `plugin.ts`.
 */

import { PLUGIN_META } from './identity';

/** The `window.Triiiceratops.svelte` members this plugin's own code calls. */
export const REQUIRED_SVELTE_EXPORTS: readonly string[] = [
    'getContext',
    'mount',
    'unmount',
];

/**
 * The `svelte/internal/client` helpers this plugin's COMPILED components
 * reference, derived the way core's export list is: by compiling the real
 * components and reading the `$.<name>` references out of the output. It is kept
 * in step with `SHARED_SVELTE_RUNTIME` in core — a name here that core does not
 * publish is exactly what this gate exists to report by name.
 */
export const REQUIRED_SVELTE_INTERNALS: readonly string[] = [
    'append',
    'bind_this',
    'child',
    'from_html',
    'pop',
    'push',
    'reset',
];

/**
 * The `window.Triiiceratops.core` utilities this IIFE validates before loading.
 */
export const REQUIRED_CORE_UTILS: readonly string[] = [
    'companionPaintable',
    'getPaintingAnnotations',
    'isImageBody',
    'isUnsupportedCanvasFor',
    'paintingBodyAlternatives',
    'parseIiifTime',
];

/*
    The three refusals, as a shared prefix and pointer plus one cause line each.
    A cause line names what is missing and, where a list exists, the names in it;
    the reasoning behind the arrangement lives in the docs the pointer names, not
    in bytes on every page.

    The two skew cases share `SKEW_REMEDY`, which is the one action that fixes
    either of them and is therefore worth its bytes once. The absent-core case
    carries its own remedy instead, since nothing there is out of step.

    Wording constraint: no message may contain `<token>.<Identifier>` where
    `<token>` could be a minified local bound to the shared-runtime namespace.
    `check-shared-runtime.mjs` scans the built text for `<local>.<Helper>`
    without excluding string literals, and the minifier is free to name one of
    this bundle's own locals after a short English word — "…BEFORE it. Load
    triiiceratops-element…" once read as a helper named `Load` off the shared
    runtime and failed the build. `window.Triiiceratops` in `ABSENT_CAUSE` is
    that same shape and safe: the scan only builds an access pattern for locals
    it saw bound to the namespace, and `window` is never one of them.
*/

const REFUSAL = '[triiiceratops] @triiiceratops/plugin-av did not register: ';

const SEE_DOCS = `. See ${PLUGIN_META.docs}`;

const ABSENT_CAUSE =
    'no window.Triiiceratops; load triiiceratops-element.iife.js first';

const MISSING_HELPERS_CAUSE = '. Missing shared Svelte helpers: ';

const MISSING_UTILS_CAUSE = '. Missing core utilities: ';

const SKEW_REMEDY = '; load matching versions of core and this plugin';

/**
 * The gate, as JavaScript source, for `rollupOptions.output.intro`.
 *
 * Source rather than an imported function because it has to run before the
 * module graph it protects — there is nothing to import from yet. Plain ES2022
 * with `var` bindings under a `__triAv` prefix, so it cannot collide with
 * rollup's own deconflicted names.
 */
export function sharedRuntimeGateSource(): string {
    const literal = (value: unknown): string => JSON.stringify(value);

    return `
var __triAvNs = typeof window === 'undefined' ? undefined : window.Triiiceratops;
var __triAvWhy = ${literal(REFUSAL)};
var __triAvSee = ${literal(SEE_DOCS)};
var __triAvSkew = ${literal(SKEW_REMEDY)};
if (!__triAvNs) {
    // triiiceratops-console-allow: see lint-allowlist.md — the last-resort
    // diagnostic of a bundle with no core to report through.
    console.error(__triAvWhy + ${literal(ABSENT_CAUSE)} + __triAvSee);
    return;
}
var __triAvCoreId = 'core ' + (__triAvNs.coreVersion || '(unknown version)');
var __triAvSvelte = __triAvNs.svelte || {};
var __triAvInternal = __triAvNs.svelteInternal || {};
var __triAvMissing = ${literal(REQUIRED_SVELTE_EXPORTS)}
    .filter(function (name) { return typeof __triAvSvelte[name] !== 'function'; })
    .concat(${literal(REQUIRED_SVELTE_INTERNALS)}.filter(function (name) {
        return typeof __triAvInternal[name] !== 'function';
    }));
if (__triAvMissing.length > 0) {
    // triiiceratops-console-allow: see lint-allowlist.md — same last-resort
    // diagnostic, for a core whose shared runtime this plugin cannot use.
    console.error(
        __triAvWhy +
            __triAvCoreId +
            ${literal(MISSING_HELPERS_CAUSE)} +
            __triAvMissing.join(', ') +
            __triAvSkew +
            __triAvSee,
    );
    return;
}
var __triAvCore = __triAvNs.core || {};
var __triAvMissingCore = ${literal(REQUIRED_CORE_UTILS)}
    .filter(function (name) { return typeof __triAvCore[name] !== 'function'; });
if (__triAvMissingCore.length > 0) {
    // triiiceratops-console-allow: see lint-allowlist.md — same last-resort
    // diagnostic, for a core that publishes no curated utilities to read.
    console.error(
        __triAvWhy +
            __triAvCoreId +
            ${literal(MISSING_UTILS_CAUSE)} +
            __triAvMissingCore.join(', ') +
            __triAvSkew +
            __triAvSee,
    );
    return;
}
`;
}
