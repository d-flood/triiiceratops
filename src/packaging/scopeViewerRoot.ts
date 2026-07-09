/*
 * PostCSS plugin: scope the viewer's global (light-DOM) stylesheet under
 * `.viewer-root`.
 *
 * Build-time tooling — this lives in `src/packaging` (NOT `src/lib`) so it is
 * never published by svelte-package. Consumed by vite.config.styles.ts.
 *
 * WHY: The global sheets (preflight reset, themes/tokens, base, layout) were
 * authored for the custom element's SHADOW ROOT, where `:root`/`:host`/`*`
 * selectors are safely isolated. Shipped as `triiiceratops/style.css` and
 * imported into a Svelte consumer's LIGHT DOM, the unscoped reset + `:root`
 * rules would clobber the host page (reset every margin/list/heading, repaint
 * the body, restyle all scrollbars, match any `[data-theme]` element).
 *
 * This plugin rewrites every selector so a rule only applies to the viewer's
 * root element (`<div class="viewer-root">`, which `applyTheme()` already
 * targets) and its descendants — never the host page. The shadow-DOM build
 * (`?inline` into the custom element) does NOT use this transform; there the
 * unscoped selectors are correct.
 */

const ROOT = '.viewer-root';

/*
 * Attributes that live directly ON the viewer root element (see
 * TriiiceratopsViewer.svelte's `<div class="viewer-root" data-*>`). A selector
 * starting with one of these targets the root itself, so it must be COMPOUNDED
 * onto `.viewer-root` (no descendant combinator). `data-panel-id` is absent —
 * it lives on descendant panels.
 */
const ROOT_ATTR_PREFIXES = [
    '[data-theme',
    '[data-controls',
    '[data-nav-style',
    '[data-nav-edge',
    '[data-nav-align',
];

/** Split a selector list on top-level commas (ignoring commas inside () or []). */
function splitTopLevel(selector: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of selector) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) {
            parts.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) parts.push(cur);
    return parts;
}

/**
 * Rewrite a full selector (possibly a comma list) so every part is constrained
 * to the viewer root. Returns the scoped selector string.
 */
export function scopeSelector(selector: string): string {
    const out: string[] = [];
    for (const raw of splitTopLevel(selector)) {
        const s = raw.trim();
        if (!s) continue;

        // Already scoped (e.g. a component-authored selector) — leave alone.
        if (s.includes(ROOT)) {
            out.push(s);
            continue;
        }

        // Root-targeting via :root / :host, possibly wrapped in :where()/:is().
        // Map both to `.viewer-root`. A bare `[data-theme]` union member (NOT
        // `[data-theme=...]`) is the "themed root" and would otherwise match any
        // page element, so collapse it to `.viewer-root` too.
        if (s.includes(':root') || s.includes(':host')) {
            const t = s
                .replace(/:root\b/g, ROOT)
                .replace(/:host\b/g, ROOT)
                .replace(/\[data-theme\](?![\w=~^$*|-])/g, ROOT);
            out.push(t);
            continue;
        }

        // A top-level attribute that lives on the root element → compound it
        // onto `.viewer-root` (e.g. `[data-theme='dark']`, `[data-nav-style=…]`).
        if (ROOT_ATTR_PREFIXES.some((p) => s.startsWith(p))) {
            out.push(ROOT + s);
            continue;
        }

        // Universal reset → the root itself AND every descendant.
        if (s === '*') {
            out.push(ROOT, `${ROOT} *`);
            continue;
        }

        // The document root element maps to the viewer root.
        if (s === 'html') {
            out.push(ROOT);
            continue;
        }

        // Everything else (elements, classes, pseudo-elements, descendant
        // attributes like [data-panel-id], .a9s-* annotation layers) is a
        // descendant of the viewer root.
        out.push(`${ROOT} ${s}`);
    }
    // De-dupe (e.g. `html, :host` both collapse to `.viewer-root`).
    return [...new Set(out)].join(', ');
}

// Minimal structural types for the PostCSS nodes this plugin touches, so it
// needs no `postcss` dependency for type-checking.
interface CssNode {
    type: string;
    prop?: string;
    remove(): void;
}
interface CssRule {
    selector: string;
    parent?: { type: string; name?: string } | null;
    nodes: CssNode[];
    each(cb: (node: CssNode) => void): void;
    remove(): void;
}

export default function scopeViewerRoot(): {
    postcssPlugin: string;
    Rule(rule: CssRule): void;
} {
    const seen = new WeakSet<object>();
    return {
        postcssPlugin: 'scope-viewer-root',
        Rule(rule: CssRule) {
            // Never scope keyframe steps (`0%`, `to`, …).
            const parent = rule.parent;
            if (
                parent &&
                parent.type === 'atrule' &&
                /keyframes$/i.test(parent.name ?? '')
            ) {
                return;
            }
            if (seen.has(rule)) return;
            rule.selector = scopeSelector(rule.selector);
            seen.add(rule);

            // base.css paints the DEMO document via `:where(:root){ background-color }`
            // — a no-op in the shadow DOM (`:root` never matches inside a shadow
            // tree) that exists only to color the demo page. In a consumer's
            // light DOM, scoping it to `.viewer-root` would paint the viewer even
            // when `transparentBackground` is set, and is otherwise redundant with
            // the component's own `.viewer-root.opaque` scoped rule. Drop the
            // root-only background so the viewer alone decides its background.
            if (rule.selector === `:where(${ROOT})`) {
                rule.each((node: CssNode) => {
                    if (
                        node.type === 'decl' &&
                        /^background(-color)?$/i.test(node.prop ?? '')
                    ) {
                        node.remove();
                    }
                });
                if (rule.nodes.length === 0) {
                    rule.remove();
                }
            }
        },
    };
}
