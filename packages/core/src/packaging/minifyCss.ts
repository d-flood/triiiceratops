/*
 * Conservative CSS minifier for the self-contained element builds (build-time
 * tooling — lives in src/packaging, never published).
 *
 * The element builds set `emitCss: false` so scoped component CSS is compiled
 * into JS string literals and injected at runtime into the custom element's
 * shadow root. That bypasses Vite's CSS pipeline entirely, so nothing in the
 * build ever minifies it: every maintainer comment and every indent in every
 * `<style>` block is shipped to every visitor.
 *
 * This module closes that gap as a Svelte STYLE PREPROCESSOR, registered only in
 * `vite.config.element.ts` and `vite.config.element-esm.ts`. The
 * `svelte-package` path (`svelte.config.js`) deliberately does NOT get it:
 * Svelte consumers keep receiving commented, readable CSS and minify it with
 * their own bundler. It is also imported directly, outside the preprocessor
 * shape, by `packages/plugin-av/vite.config.ts`, which runs it over the plain
 * `.css` files that package pulls into its IIFE as `?raw` strings — a bundle
 * with the same gap and the same reason to close it.
 *
 * The transformation is deliberately narrow, because the output is never
 * re-parsed by anything that would catch a mistake:
 *
 *   - Comments are removed, but replaced by whitespace, never by nothing — a
 *     comment can sit between two tokens (`.a/* x *\/.b`) and deleting it would
 *     weld them together.
 *   - Runs of whitespace collapse to one space, and that space is dropped ONLY
 *     when it is adjacent to `{`, `}` or `;`. Everywhere else a space may be
 *     load-bearing, and two cases in this repository provably are: a descendant
 *     combinator before a pseudo-class (`.menu-item :global(svg)`) and the
 *     operators inside `calc(100% + 0.5rem)`.
 *   - String literals and `url()` arguments are copied verbatim, so a `/*`
 *     inside `content:` is never mistaken for a comment and spacing inside a
 *     quoted value is never touched.
 *
 * A real CSS parser was evaluated and rejected: lightningcss over this pass's
 * output recovered only 157 further gzip bytes, which does not justify a parser
 * in the build path. `minifyCss.equivalence.test.ts` instead proves this pass
 * semantics-preserving by parsing every component stylesheet in the repository,
 * before and after, and comparing the ASTs.
 */

/** Whitespace is dropped when it sits next to one of these. */
const WHITESPACE_INSIGNIFICANT_NEXT_TO = new Set(['{', '}', ';']);

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f']);

/** Characters that can precede `url(` as part of a longer function name. */
const IDENT_CHAR = /[\w-]/;

function isUrlFunctionAt(
    css: string,
    index: number,
    previous: string,
): boolean {
    if (previous !== '' && IDENT_CHAR.test(previous)) return false;
    return css.slice(index, index + 4).toLowerCase() === 'url(';
}

/** Index just past the closing quote of the string literal starting at `index`. */
function endOfString(css: string, index: number): number {
    const quote = css[index];
    let i = index + 1;
    while (i < css.length) {
        const char = css[i];
        if (char === '\\') {
            i += 2;
            continue;
        }
        i += 1;
        if (char === quote) break;
    }
    return i;
}

/**
 * Index just past the `)` closing the `url(` starting at `index`. Quoted
 * arguments are skipped as strings so a `)` inside them does not end the scan.
 */
function endOfUrl(css: string, index: number): number {
    let i = index + 4;
    while (i < css.length) {
        const char = css[i];
        if (char === '"' || char === "'") {
            i = endOfString(css, i);
            continue;
        }
        if (char === '\\') {
            i += 2;
            continue;
        }
        i += 1;
        if (char === ')') break;
    }
    return i;
}

/**
 * Strip comments and redundant whitespace from a stylesheet without changing
 * what it means. See the module comment for the rules and why they are this
 * conservative.
 */
export function minifyCss(css: string): string {
    let out = '';
    let pendingSpace = false;
    let i = 0;

    /*
     * Emit the pending whitespace unless it is adjacent to a token that cannot
     * be separated from its neighbour by whitespace. `out === ''` covers leading
     * whitespace; trailing whitespace is simply never flushed.
     */
    const flushSpace = (next: string) => {
        if (!pendingSpace) return;
        pendingSpace = false;
        if (out === '') return;
        if (WHITESPACE_INSIGNIFICANT_NEXT_TO.has(out[out.length - 1])) return;
        if (WHITESPACE_INSIGNIFICANT_NEXT_TO.has(next)) return;
        out += ' ';
    };

    while (i < css.length) {
        const char = css[i];

        if (WHITESPACE.has(char)) {
            pendingSpace = true;
            i += 1;
            continue;
        }

        // A comment is whitespace, not nothing: it may be separating two tokens.
        if (char === '/' && css[i + 1] === '*') {
            const end = css.indexOf('*/', i + 2);
            i = end === -1 ? css.length : end + 2;
            pendingSpace = true;
            continue;
        }

        if (char === '"' || char === "'") {
            flushSpace(char);
            const end = endOfString(css, i);
            out += css.slice(i, end);
            i = end;
            continue;
        }

        /*
         * The character before this one, for the "is this a fresh `url(` token
         * or the tail of `myurl(`" test. Pending whitespace has not been
         * flushed into `out` yet, so when it is pending the previous meaningful
         * character IS whitespace — reporting `out`'s last character instead
         * would see the `d` of `background: red url(…)` and take the URL down
         * the generic path, where comment-stripping would eat a `/*` in its
         * contents.
         */
        const previous = pendingSpace ? '' : (out[out.length - 1] ?? '');
        if (isUrlFunctionAt(css, i, previous)) {
            flushSpace(char);
            const end = endOfUrl(css, i);
            out += css.slice(i, end);
            i = end;
            continue;
        }

        flushSpace(char);
        out += char;
        i += 1;
    }

    return out;
}

/*
 * The style-preprocessor shape Svelte expects. Typed structurally rather than
 * imported from `svelte/compiler` so this module stays a plain build-time
 * helper with no compiler import.
 */
export interface StylePreprocessorInput {
    content: string;
    attributes: Record<string, string | boolean>;
    markup: string;
    filename?: string;
}

export interface StylePreprocessor {
    name: string;
    style(input: StylePreprocessorInput): { code: string } | undefined;
}

/**
 * Svelte style preprocessor wrapping {@link minifyCss}. Register it ONLY in the
 * element build configs; the `svelte-package` path must keep shipping readable
 * CSS.
 */
export function minifyCssPreprocessor(): StylePreprocessor {
    return {
        name: 'triiiceratops-minify-css',
        style({ content, attributes }) {
            // Every `<style>` block in this repository is plain CSS. A block
            // declaring another language belongs to whatever preprocessor
            // handles it, and this scanner's rules would not hold for it.
            if (attributes.lang !== undefined && attributes.lang !== 'css') {
                return undefined;
            }
            return { code: minifyCss(content) };
        },
    };
}
