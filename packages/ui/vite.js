/**
 * Build-time helper for CSP-safe plugin styling (epic restore-plugin-toolbar-chrome).
 *
 * First-party plugins are built self-contained with `emitCss: false`, which makes
 * Svelte inline each component's CSS into the JS and inject it at runtime with
 * `append_styles` — a `<style>` element appended to the document head with **no
 * CSP nonce**. Under a strict `style-src` policy the browser blocks it, so any
 * `@triiiceratops/ui` component (or plugin component) that carries a `<style>`
 * block would silently lose its styling. Core avoids this because it either
 * extracts CSS to a linked stylesheet or scopes it into the Web Component's
 * shadow root; plugins render into the live light DOM and do neither.
 *
 * This Vite plugin lets plugins keep **idiomatic, Svelte-scoped `<style>` blocks**
 * while staying CSP-safe. Pair it with `emitCss: true` (+ `cssCodeSplit: false`):
 * Svelte then *extracts* the (still hash-scoped) component CSS through Vite's CSS
 * pipeline into a bundle asset instead of injecting it. This plugin collects that
 * asset, strips it from the output (the plugin ships a single self-contained JS,
 * never a stray `.css` file), and exposes it as the default export of the virtual
 * module {@link CSS_MODULE_ID}. The plugin's entry imports that string and installs
 * it through the root-aware, nonce-aware SDK style service
 * (`context.styles.install`) — the same CSP-safe sink `styleService.ts` already
 * uses (constructable `adoptedStyleSheets`, with a nonce-stamped `<style>` fallback).
 *
 * Usage (in a plugin's `vite.config.ts`):
 *   import { bundledCss, CSS_MODULE_ID } from '@triiiceratops/ui/vite';
 *   plugins: [svelte({ emitCss: true, compilerOptions: { customElement: false } }), bundledCss()]
 *   build: { cssCodeSplit: false, ... }
 * and in the plugin entry:
 *   import BUNDLED_CSS from 'virtual:tri-bundled-css';
 *   context.styles.install(BUNDLED_CSS, 'bundled');
 *
 * Dependency-free and build-only (`apply: 'build'`); it pulls no runtime into the
 * shipped bundle.
 */

/** The virtual module a plugin entry imports to obtain its extracted CSS string. */
export const CSS_MODULE_ID = 'virtual:tri-bundled-css';

const RESOLVED_ID = '\0' + CSS_MODULE_ID;
// A unique token planted as the virtual module's value at load time, then swapped
// for the real (extracted) CSS in generateBundle — the only point at which every
// component's CSS is known. Replaced quotes-and-all, so minifier quote-style
// choices don't matter.
const PLACEHOLDER = '__TRI_BUNDLED_CSS_PLACEHOLDER_9f3a__';

/**
 * @returns {import('vite').Plugin} A build-only Vite plugin that extracts all
 *   emitted CSS into the {@link CSS_MODULE_ID} virtual module and removes the
 *   standalone CSS asset from the bundle.
 */
export function bundledCss() {
    let isBuild = false;
    return {
        name: 'triiiceratops:bundled-css-as-string',
        // Not `apply: 'build'`: the virtual module must also resolve under vitest
        // / dev (serve), where there is no bundling step. It resolves to an empty
        // string there (tests don't need real CSS); only a production build
        // extracts and injects the actual component CSS in generateBundle.
        // Run after Vite's own `vite:css-post` plugin so the extracted `.css`
        // asset already exists in the bundle when generateBundle collects it.
        enforce: 'post',
        configResolved(config) {
            isBuild = config.command === 'build';
        },
        resolveId(id) {
            if (id === CSS_MODULE_ID) return RESOLVED_ID;
            return null;
        },
        load(id) {
            if (id !== RESOLVED_ID) return null;
            // In a build the value is the placeholder, rewritten by generateBundle
            // once the full extracted CSS is known; elsewhere (vitest/serve) there
            // is no bundle to extract from, so resolve to an empty string.
            return `export default ${JSON.stringify(isBuild ? PLACEHOLDER : '')};`;
        },
        generateBundle(_options, bundle) {
            let css = '';
            for (const [fileName, chunk] of Object.entries(bundle)) {
                if (chunk.type === 'asset' && fileName.endsWith('.css')) {
                    const source = chunk.source;
                    css +=
                        typeof source === 'string'
                            ? source
                            : Buffer.from(source).toString('utf8');
                    // The plugin ships one self-contained JS; drop the stray asset.
                    delete bundle[fileName];
                }
            }
            const literal = JSON.stringify(css);
            // Replace the placeholder string literal (whatever quote the minifier
            // chose) with a valid double-quoted JS string of the extracted CSS.
            const pattern = new RegExp(`(['"\`])${PLACEHOLDER}\\1`, 'g');
            for (const chunk of Object.values(bundle)) {
                if (
                    chunk.type === 'chunk' &&
                    chunk.code.includes(PLACEHOLDER)
                ) {
                    chunk.code = chunk.code.replace(pattern, () => literal);
                }
            }
        },
    };
}
