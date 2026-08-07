/**
 * Root-aware plugin style service (ticket 08).
 *
 * Installs a plugin's global CSS into the owning viewer's style root — the
 * `Document` for a light-DOM Svelte viewer, the shadow root for the Web
 * Component (SPEC.md "Plugin SDK And Browser API"; CONTEXT.md **Active locale**
 * is the sibling per-viewer contract). Behavior required by the ticket:
 *
 * - **Package-qualified keys.** Each install is keyed `<pluginName>:<id>`, so
 *   two plugins can use the same local `id` without colliding.
 * - **Dedupe + refcount across a shared root.** The registry is module-level and
 *   keyed by the *root node*, so multiple activations/viewers that share a root
 *   (e.g. two Svelte viewers in one document) install one sheet and share a
 *   reference count. The sheet is removed only when the last reference releases.
 * - **Constructable stylesheets, with a nonce-aware `<style>` fallback.** Where
 *   `adoptedStyleSheets` + `CSSStyleSheet.replaceSync` are available the sheet is
 *   constructable (no inline `<style>`, CSP-friendly by default); otherwise a
 *   `<style>` element is appended, carrying a discovered CSP nonce so it survives
 *   a strict `style-src` policy.
 *
 * The service instance is per activation; the SDK releases any references still
 * held when the activation is torn down.
 */
import type { PluginStyleService } from '../types/plugin';
/** Options for {@link createPluginStyleService}; the extra hooks are for tests. */
export interface StyleServiceOptions {
    /**
     * Force the `<style>`-element fallback even where constructable stylesheets
     * are supported. Lets the fallback path be exercised deterministically
     * regardless of the test DOM engine's capabilities.
     */
    forceFallback?: boolean;
    /** Override the discovered nonce (testing / explicit host nonce). */
    nonce?: string;
}
/**
 * Create a per-activation style service bound to one style root and one plugin
 * package name. `root` is typically {@link ViewerState.getStyleRoot}; it falls
 * back to `document` when the viewer is not yet mounted.
 */
export declare function createPluginStyleService(root: Document | ShadowRoot, pluginName: string, options?: StyleServiceOptions): PluginStyleService;
