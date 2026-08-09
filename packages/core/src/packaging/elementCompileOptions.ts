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
 * to say so. The artifact is guarded on its own terms elsewhere:
 * `scripts/check-element-artifact.mjs` requires the wrapper's attribute map and
 * exactly one registration in each bundle, and `distributions.test.ts` runs the
 * built IIFE and watches it define the element.
 */
export function wrapperCustomElementGuard() {
    let upgraded = 0;
    return {
        dynamicCompileOptions(options: { filename: string }) {
            const compileOptions = elementOnlyCustomElement(options);
            if (compileOptions) upgraded += 1;
            return compileOptions;
        },
        /** Register alongside `svelte()` in the element build configs. */
        plugin: {
            name: 'triiiceratops:require-custom-element-wrapper',
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
            },
        },
    };
}
