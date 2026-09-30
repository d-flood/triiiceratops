/**
 * No component is compiled as a custom element: `<triiiceratops-viewer>` is the
 * hand-written `ViewerElement` (`src/lib/components/viewerElement.svelte.ts`),
 * which mounts an ordinary wrapper component with Svelte's public `mount`.
 *
 * Every config keeps `compilerOptions.customElement: false`, and
 * `svelte.config.js` states the same rule; in the element builds,
 * `noCustomElementGuard` fails a build that compiles one anyway.
 */

/**
 * The runtime helper Svelte's custom-element codegen emits once per component
 * it compiles as a custom element, and never for an ordinary one.
 */
const CUSTOM_ELEMENT_CODEGEN = /create_custom_element\s*\(/g;

/**
 * The compiled component module, and only it. vite-plugin-svelte gives the
 * component itself a bare id and every sub-module a query
 * (`Foo.svelte?svelte&type=style`).
 */
function isComponentModule(id: string): boolean {
    return !id.includes('?') && id.endsWith('.svelte');
}

/**
 * A Rollup plugin that fails the build if any compiled component carries
 * custom-element codegen. It counts the compiler's own output rather than the
 * shipped bundle, where terser inlines a helper with a single call site.
 * Register it AFTER `svelte()` in the element build configs.
 */
export function noCustomElementGuard() {
    const codegen = new Map<string, number>();
    return {
        name: 'triiiceratops:no-custom-element-codegen',
        transform(code: string, id: string) {
            if (!isComponentModule(id)) return null;
            const sites = code.match(CUSTOM_ELEMENT_CODEGEN)?.length ?? 0;
            if (sites > 0) codegen.set(id, sites);
            return null;
        },
        buildEnd(error?: Error) {
            if (error) return;
            if (codegen.size > 0) {
                throw new Error(
                    `${codegen.size} component(s) in this build were compiled ` +
                        `as custom elements; none may be. ` +
                        `<triiiceratops-viewer> is the hand-written ` +
                        `ViewerElement, so keep ` +
                        `\`compilerOptions.customElement: false\` and drop ` +
                        `any \`<svelte:options customElement>\`. Compiled as ` +
                        `custom elements: [${[...codegen.keys()].join(', ')}].`,
                );
            }
        },
    };
}
