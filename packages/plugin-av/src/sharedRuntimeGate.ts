/**
 * The IIFE's **version-skew gate**: the check that runs before any of this
 * plugin's code does.
 *
 * This plugin does not bundle Svelte; its compiled components call helpers off
 * `window.Triiiceratops.svelteInternal` (see `vite.config.ts`). Those calls
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
    'bind_select_value',
    'bind_this',
    'child',
    'delegate',
    'derived',
    'each',
    'first_child',
    'from_html',
    'get',
    'if',
    'pop',
    'push',
    'reset',
    'set',
    'set_text',
    'sibling',
    'state',
    'template_effect',
    'text',
];

const ABSENT_MESSAGE =
    '[triiiceratops] @triiiceratops/plugin-av did not register: ' +
    'window.Triiiceratops is not on this page. This is the one plugin that does ' +
    'not bundle its own Svelte runtime — it reads core’s off that ' +
    'namespace — so core’s script must load BEFORE it. Load ' +
    'triiiceratops-element.iife.js first, then this bundle.';

const SKEW_MESSAGE_PREFIX =
    '[triiiceratops] @triiiceratops/plugin-av did not register: core ';

const SKEW_MESSAGE_MIDDLE =
    ' is on this page but does not share the Svelte runtime this plugin was ' +
    'built against. Missing helpers: ';

const SKEW_MESSAGE_SUFFIX =
    '. Core and this plugin ship from one repository at one Svelte version; ' +
    'load matching versions of both.';

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
if (!__triAvNs) {
    // triiiceratops-console-allow: see lint-allowlist.md — the last-resort
    // diagnostic of a bundle with no core to report through.
    console.error(${literal(ABSENT_MESSAGE)});
    return;
}
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
        ${literal(SKEW_MESSAGE_PREFIX)} +
            (__triAvNs.coreVersion || '(unknown version)') +
            ${literal(SKEW_MESSAGE_MIDDLE)} +
            __triAvMissing.join(', ') +
            ${literal(SKEW_MESSAGE_SUFFIX)},
    );
    return;
}
`;
}
