import { basename } from 'node:path';

/**
 * Custom-element codegen is for the wrapper alone.
 *
 * `TriiiceratopsViewerElement.svelte` is the only component that declares
 * `<svelte:options customElement>` and the only one ever registered with
 * `customElements.define`. Compiling anything else as a custom element adds a
 * wrapper class nobody instantiates and makes the compiler warn
 * (`custom_element_props_identifier`) about props it cannot map to attributes.
 *
 * The element builds set `configFile: false`, so they cannot inherit the
 * equivalent rule from `svelte.config.js`; both of them import this instead of
 * restating it, so the two artifacts cannot drift apart.
 */
export const CUSTOM_ELEMENT_WRAPPER = 'TriiiceratopsViewerElement.svelte';

/**
 * The runtime helper Svelte's custom-element codegen emits, exactly once per
 * component it compiles as a custom element, and never for a component it
 * compiles ordinarily. Counting it across the compiled `.svelte` modules is the
 * whole rule, stated as a number.
 */
const CUSTOM_ELEMENT_CODEGEN = /create_custom_element\s*\(/g;

/**
 * The compiled component module, and only it. vite-plugin-svelte gives the
 * component itself a bare id and every sub-module a query
 * (`Foo.svelte?svelte&type=style`), so a query means "not the JS I am counting".
 * Undercounting fails this guard closed — 0 is as loud as 31.
 */
function isComponentModule(id: string): boolean {
    return !id.includes('?') && id.endsWith('.svelte');
}

/**
 * `dynamicCompileOptions` hook for vite-plugin-svelte: upgrade the wrapper to a
 * custom element and leave every other component an ordinary Svelte component.
 *
 * The match is on the whole basename, not a suffix: `endsWith` would also claim
 * `NotTriiiceratopsViewerElement.svelte`, and a stray component whose name
 * happens to end this way would be silently pushed through custom-element
 * codegen. Vite normalizes module ids to `/`, and `path.basename` splits on
 * `\` too, so this reads the same on either platform.
 */
export function elementOnlyCustomElement({
    filename,
}: {
    filename: string;
}): { customElement: true } | undefined {
    return basename(filename) === CUSTOM_ELEMENT_WRAPPER
        ? { customElement: true }
        : undefined;
}

/**
 * The same hook, plus a Rollup plugin that fails the build if the hook never
 * matched anything.
 *
 * A hard-coded filename rots the moment somebody renames or moves the file, and
 * this one is spelled out twice (here and in `svelte.config.js`, which is plain
 * JS and cannot import this module). Nothing else notices when it goes stale:
 * the hook just answers `undefined` to everything, quietly, forever.
 *
 * What a stale name costs is worth stating precisely, because it is smaller
 * than it looks. The compiler takes `customElementOptions ?? customElement`, and
 * the wrapper declares its own `<svelte:options customElement={{…}}>` — so the
 * wrapper gets its `element` static, with its full attribute map, whether or not
 * this hook ever names it. The narrowing that matters is `customElement: false`
 * in the three configs, which keeps the other ~30 components out of
 * custom-element codegen. What this hook adds on top is the wrapper's exemption
 * from that `false`, which shows up only as the absence of the compiler's
 * `options_missing_custom_element` warning.
 *
 * So a stale name here ships a correct bundle and a noisy build. That is a
 * drifted config rather than a broken artifact, and this is the cheapest place
 * to say so.
 *
 * The second rule this plugin enforces is the one that costs bytes, and it is
 * counted rather than named: across the whole build graph, exactly ONE compiled
 * component may carry custom-element codegen. It is asserted here, on the
 * compiler's own output, and not on the shipped bundle, because the bundle
 * cannot answer the question. `scripts/check-element-artifact.mjs` used to count
 * `create_custom_element(…)` call shapes in the minified text; terser inlines a
 * helper with a single call site, so the correct artifact has no call left to
 * count while the 31-component regression keeps the helper shared and its 31
 * calls intact. A text heuristic that reads 0 for "right" and 31 for "wrong" is
 * not a count. The compiled modules give the exact number for free.
 *
 * What still guards the artifacts themselves: `check-element-artifact.mjs`
 * requires the wrapper's attribute map in each bundle, and
 * `distributions.test.ts` runs the built IIFE and watches it define exactly
 * `triiiceratops-viewer`.
 */
export function wrapperCustomElementGuard() {
    let upgraded = 0;
    /** Compiled component modules carrying custom-element codegen, by id. */
    const codegen = new Map<string, number>();
    return {
        dynamicCompileOptions(options: { filename: string }) {
            const compileOptions = elementOnlyCustomElement(options);
            if (compileOptions) upgraded += 1;
            return compileOptions;
        },
        /**
         * Register alongside `svelte()` in the element build configs, AFTER it
         * in the plugins array — this reads what the Svelte compiler emitted.
         */
        plugin: {
            name: 'triiiceratops:require-custom-element-wrapper',
            transform(code: string, id: string) {
                if (!isComponentModule(id)) return null;
                const sites = code.match(CUSTOM_ELEMENT_CODEGEN)?.length ?? 0;
                if (sites > 0) codegen.set(id, sites);
                return null;
            },
            buildEnd(error?: Error) {
                // A build that already failed has its own error to report.
                if (error) return;
                if (upgraded === 0) {
                    throw new Error(
                        `Nothing in this build graph is named ` +
                            `"${CUSTOM_ELEMENT_WRAPPER}", so the wrapper-only ` +
                            `custom-element rule matched no file at all and this ` +
                            `build ran with no rule in effect. The wrapper was ` +
                            `renamed, moved, or dropped from the graph: update ` +
                            `CUSTOM_ELEMENT_WRAPPER in ` +
                            `src/packaging/elementCompileOptions.ts and the copy of ` +
                            `the name in svelte.config.js.`,
                    );
                }
                let total = 0;
                for (const sites of codegen.values()) total += sites;
                if (total !== 1) {
                    throw new Error(
                        `${total} component(s) in this build were compiled as ` +
                            `custom elements; "${CUSTOM_ELEMENT_WRAPPER}" is the ` +
                            `only one allowed. A global ` +
                            `\`compilerOptions.customElement: true\` puts every ` +
                            `component in the graph through custom-element codegen ` +
                            `— the element builds must keep it \`false\` and narrow ` +
                            `with \`dynamicCompileOptions\` instead. Compiled as ` +
                            `custom elements: ` +
                            `[${[...codegen.keys()].join(', ') || 'none'}].`,
                    );
                }
            },
        },
    };
}
