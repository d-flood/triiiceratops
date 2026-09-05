/**
 * The `virtual:tri-bundled-css` module is provided at build time by `bundledCss()`
 * (from `@triiiceratops/ui/vite`, wired in vite.config.ts). Its default export is
 * the plugin bundle's extracted, Svelte-scoped component CSS as a string, which
 * the plugin installs through the SDK style service to stay CSP-safe. See
 * `@triiiceratops/ui/vite` and this package's vite.config.ts.
 */
declare module 'virtual:tri-bundled-css' {
    const css: string;
    export default css;
}

/**
 * A stylesheet imported as a string instead of through Vite's CSS pipeline —
 * `src/stage.css`, which the SDK style service installs. The build minifies the
 * string it resolves to; see this package's vite.config.ts.
 */
declare module '*.css?raw' {
    const css: string;
    export default css;
}
