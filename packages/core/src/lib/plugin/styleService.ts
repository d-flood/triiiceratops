/**
 * Root-aware plugin style service.
 *
 * Installs a plugin's global CSS into the owning viewer's style root — the
 * `Document` for a light-DOM Svelte viewer, the shadow root for the Web
 * Component (SPEC.md "Plugin SDK And Browser API"; CONTEXT.md **Active locale**
 * is the sibling per-viewer contract). Required behavior:
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

/**
 * Nonce discovery: the host advertises its style nonce either as
 * `<meta property="csp-nonce" content="…">` (or the IDL `.nonce` on that meta)
 * or on any already-nonced `<style>`/`<script>`/`<link>` element. The `.nonce`
 * IDL property is read in preference to `getAttribute('nonce')` because browsers
 * hide the attribute from `getAttribute` for injected markup but keep the IDL
 * property readable. Returns `undefined` when the host supplies no nonce.
 */
function discoverNonce(doc: Document): string | undefined {
    const meta = doc.querySelector('meta[property="csp-nonce"]');
    if (meta) {
        const idl = (meta as HTMLElement & { nonce?: string }).nonce;
        return idl || meta.getAttribute('content') || undefined;
    }
    const nonced = doc.querySelector<HTMLElement>(
        'style[nonce], script[nonce], link[nonce]',
    );
    return nonced?.nonce || undefined;
}

/**
 * Whether the host has explicitly opted into nonce-governed styles by publishing
 * a `<meta property="csp-nonce">` element. This is the "style nonce
 * where required" signal from the SPEC: a host running a nonce-based
 * `style-src 'self' 'nonce-…'` (without `unsafe-inline`) advertises its nonce so
 * the service takes the nonce-aware `<style>` fallback — a nonce cannot be
 * carried by a constructable/adopted stylesheet, so under such a policy the
 * fallback is the CSP-correct path. Absent the meta, the constructable path
 * remains the default (it is not governed by `style-src` at all).
 */
function hasCspNonceMeta(doc: Document): boolean {
    return doc.querySelector('meta[property="csp-nonce"]') !== null;
}

/**
 * Narrow a style root to `Document`. Uses `nodeType` (9 = `DOCUMENT_NODE`, 11 =
 * `DOCUMENT_FRAGMENT_NODE` for a shadow root) rather than `instanceof`, which is
 * unreliable across realms and in some test DOM engines.
 */
function isDocumentNode(root: Document | ShadowRoot): root is Document {
    return root.nodeType === 9;
}

/** The owning document of a style root (a `Document` is its own document). */
function ownerDocumentOf(root: Document | ShadowRoot): Document {
    return isDocumentNode(root) ? root : (root.ownerDocument ?? document);
}

/** Feature-detect constructable stylesheet support for a given root. */
function supportsConstructable(root: Document | ShadowRoot): boolean {
    return (
        typeof CSSStyleSheet === 'function' &&
        'replaceSync' in CSSStyleSheet.prototype &&
        Array.isArray(
            (root as { adoptedStyleSheets?: unknown }).adoptedStyleSheets,
        )
    );
}

/** One installed sheet plus its live reference count. */
interface InstalledSheet {
    count: number;
    /** The constructable sheet, when the constructable path was taken. */
    sheet?: CSSStyleSheet;
    /** The fallback `<style>` element, when the fallback path was taken. */
    element?: HTMLStyleElement;
}

/**
 * Module-level registry, keyed by the *root node* so references dedupe across
 * every activation and viewer sharing that root. A `WeakMap` lets a root and its
 * sheets be collected once the root goes away.
 */
const registry = new WeakMap<
    Document | ShadowRoot,
    Map<string, InstalledSheet>
>();

function sheetsFor(root: Document | ShadowRoot): Map<string, InstalledSheet> {
    let map = registry.get(root);
    if (!map) {
        map = new Map();
        registry.set(root, map);
    }
    return map;
}

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
export function createPluginStyleService(
    root: Document | ShadowRoot,
    pluginName: string,
    options: StyleServiceOptions = {},
): PluginStyleService {
    const doc = ownerDocumentOf(root);
    // Prefer the nonce-aware `<style>` fallback when the host forces it or has
    // advertised a CSP style nonce (see hasCspNonceMeta); otherwise use the
    // constructable path where supported.
    const preferFallback = options.forceFallback || hasCspNonceMeta(doc);
    const useConstructable = !preferFallback && supportsConstructable(root);
    const sheets = sheetsFor(root);

    function acquire(key: string, css: string): void {
        const existing = sheets.get(key);
        if (existing) {
            existing.count += 1;
            return;
        }
        const entry: InstalledSheet = { count: 1 };
        if (useConstructable) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
            entry.sheet = sheet;
        } else {
            const element = doc.createElement('style');
            element.setAttribute('data-triiiceratops-plugin-style', key);
            const nonce = options.nonce ?? discoverNonce(doc);
            if (nonce) element.nonce = nonce;
            element.textContent = css;
            // Shadow roots have no <head>; append to the root itself. Documents
            // get the sheet in <head> (falling back to the element for exotic
            // documents without one).
            const target = isDocumentNode(root)
                ? (root.head ?? root.documentElement ?? root)
                : root;
            target.appendChild(element);
            entry.element = element;
        }
        sheets.set(key, entry);
    }

    function release(key: string): void {
        const entry = sheets.get(key);
        if (!entry) return;
        entry.count -= 1;
        if (entry.count > 0) return;
        if (entry.sheet) {
            root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
                (s) => s !== entry.sheet,
            );
        }
        entry.element?.remove();
        sheets.delete(key);
    }

    return {
        install(css: string, id: string): () => void {
            const key = `${pluginName}:${id}`;
            acquire(key, css);
            let released = false;
            return () => {
                if (released) return;
                released = true;
                release(key);
            };
        },
    };
}
