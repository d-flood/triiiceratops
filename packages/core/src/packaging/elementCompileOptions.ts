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
 */
export function elementOnlyCustomElement({
    filename,
}: {
    filename: string;
}): { customElement: true } | undefined {
    return filename.endsWith(CUSTOM_ELEMENT_WRAPPER)
        ? { customElement: true }
        : undefined;
}
