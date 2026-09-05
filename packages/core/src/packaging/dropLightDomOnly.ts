/*
 * PostCSS plugin: drop the global rules the custom element's SHADOW ROOT can
 * never match.
 *
 * Build-time tooling — this lives in `src/packaging` (NOT `src/lib`) so it is
 * never published by svelte-package. Consumed by vite.config.element.ts and
 * vite.config.element-esm.ts.
 *
 * WHY: the five sheets behind `app.css` have three consumers and only one of
 * them is byte-budgeted. `app.css?inline` goes into the shadow root, which
 * contains nothing but the viewer's own markup, its plugins' panels, and IIIF
 * rich text filtered through `sanitizeHtml`'s allowlist — so a reset for
 * `<hr>`, `<table>` or a date picker's shadow parts is bytes every reader
 * downloads for markup that cannot appear. The other two consumers reset a
 * whole document (the playground at `apps/demo`) or a library consumer's
 * light DOM (`lib/styles-lightdom.ts` → `dist/triiiceratops.css`), where those
 * same elements are ordinary and the rules are load-bearing.
 *
 * A rule is marked for the element build to drop by putting a CSS comment
 * containing exactly `light-dom-only` directly above it. This plugin removes
 * the marker and the one rule that follows it.
 *
 * The marker sits on the rule rather than in a list here so the two cannot
 * drift, and so the reason a rule is unreachable is written where a reader of
 * the stylesheet will look for it. Only the element configs register this
 * plugin; every other build sees the sheets whole, and because CSS comments do
 * not survive minification the markers cost the light-DOM sheet zero bytes.
 *
 * A marker with nothing after it, or with anything other than a rule after it,
 * throws: deleting a marked rule but leaving its marker, or letting prose or a
 * second marker slip between a marker and its rule, fails the build rather than
 * dropping the wrong node or nothing at all.
 *
 * The plugin ceasing to run at all is caught too, by the RAW metric in
 * `scripts/size-check.mjs`: the marked rules weigh 1,117 raw bytes against that
 * gate's 512-byte slack, so `build:element` fails rather than warns. (Gzip
 * alone would not catch it — the same rules are only ~300 bytes compressed.)
 * The reverse direction, a component starting to emit an element whose reset is
 * marked, is guarded by `scripts/check-element-artifact.mjs`, which re-derives
 * the marked element names from these same markers and fails if one appears as
 * a tag in the built bundle.
 */

const MARKER = 'light-dom-only';

// Minimal structural types for the PostCSS nodes this plugin touches, so it
// needs no `postcss` dependency for type-checking.
interface CssNode {
    /** PostCSS node type: `rule`, `atrule`, `decl`, `comment` or `root`. */
    type: string;
    source?: {
        input?: { from?: string };
        start?: { line: number; column: number };
    };
    remove(): void;
}
export interface CssComment extends CssNode {
    text: string;
    next(): CssNode | undefined;
}

/** `file:line:column` for an error message, from whatever the node carries. */
function locate(node: CssNode): string {
    const from = node.source?.input?.from ?? '<unknown source>';
    const start = node.source?.start;
    return start ? `${from}:${start.line}:${start.column}` : from;
}

export default function dropLightDomOnly(): {
    postcssPlugin: string;
    Comment(comment: CssComment): void;
} {
    return {
        postcssPlugin: 'drop-light-dom-only',
        Comment(comment: CssComment) {
            if (comment.text.trim() !== MARKER) return;
            const marked = comment.next();
            if (!marked) {
                throw new Error(
                    `A \`${MARKER}\` comment at ${locate(comment)} has no rule ` +
                        `after it to drop.`,
                );
            }
            // `next()` is the next SIBLING, whatever it is: a second marker, an
            // explanatory comment, or — for a marker misplaced inside a rule
            // body — a declaration. Removing any of those would either drop the
            // wrong node or leave the marked rule in the bundle unannounced.
            if (marked.type !== 'rule' && marked.type !== 'atrule') {
                throw new Error(
                    `A \`${MARKER}\` comment at ${locate(comment)} is followed ` +
                        `by a ${marked.type}, not a rule. The marker must sit ` +
                        `directly above the rule it drops, with nothing in ` +
                        `between.`,
                );
            }
            comment.remove();
            marked.remove();
        },
    };
}
