/*
 * Proves `minifyCss` semantics-preserving over the whole repository rather than
 * over hand-picked samples.
 *
 * Every `<style>` block in every `.svelte` file under `packages/<pkg>/src` is
 * parsed twice — as authored and as minified — through a REAL CSS parser, and
 * the two ASTs are compared. The parser is Svelte's own (`svelte/compiler`),
 * which is both a genuine parser and the exact one that consumes this CSS in the
 * build, so an equivalence it reports is the equivalence that matters.
 *
 * Normalisation before comparison is limited to the things the minifier is
 * allowed to change: source positions, the raw stylesheet text the parser
 * carries alongside the AST, and — OUTSIDE quoted strings and `url()` arguments,
 * which the minifier copies verbatim — comments and runs of whitespace inside
 * raw value strings. Anything else — a lost selector, a welded-together
 * combinator, a mangled `calc()`, a byte changed inside a quoted value — shows
 * up as a diff. The `rejects` cases below prove the comparison can still fail.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';
import { parse } from 'svelte/compiler';

import { minifyCss } from './minifyCss';

const PACKAGES_DIR = resolve(import.meta.dirname, '../../..');

/*
 * Only authored sources. `dist/` and `.svelte-kit/` hold copies of these same
 * components and would double every case.
 */
const SOURCE_SUBDIR = 'src';

/*
 * The one `<style>` this file cannot check, named explicitly so it is skipped
 * loudly rather than silently: the Web Component wrapper builds a light-DOM
 * stylesheet at RUNTIME with `{@html `<style>${styles}</style>`}`. That text is
 * a Svelte template literal, not a stylesheet — its content is a `${…}`
 * interpolation of an imported CSS file, so no CSS parser can read it and the
 * minifier never sees it (a preprocessor only visits real `<style>` elements).
 */
const INTERPOLATION = '${';

interface StyleBlock {
    file: string;
    css: string;
}

function svelteFilesUnder(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            found.push(...svelteFilesUnder(path));
        } else if (entry.name.endsWith('.svelte')) {
            found.push(path);
        }
    }
    return found;
}

function packageSourceDirs(): string[] {
    return readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(PACKAGES_DIR, entry.name, SOURCE_SUBDIR))
        .filter((dir) => existsSync(dir));
}

const STYLE_BLOCK = /<style(?![\w-])[^>]*>([\s\S]*?)<\/style>/g;

function collectStyleBlocks(): { blocks: StyleBlock[]; skipped: StyleBlock[] } {
    const blocks: StyleBlock[] = [];
    const skipped: StyleBlock[] = [];
    for (const dir of packageSourceDirs()) {
        for (const file of svelteFilesUnder(dir)) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(STYLE_BLOCK)) {
                const block = {
                    file: file.slice(PACKAGES_DIR.length),
                    css: match[1],
                };
                if (block.css.includes(INTERPOLATION)) skipped.push(block);
                else blocks.push(block);
            }
        }
    }
    return { blocks, skipped };
}

/*
 * Neutralise the two things the minifier is allowed to change inside a raw
 * string the AST carries verbatim (`Declaration.value`, `AttributeSelector`
 * values, selector text): comments, which become whitespace, and runs of
 * whitespace, which become one space.
 *
 * Crucially it stops wherever the minifier itself stops: quoted strings and
 * `url(…)` arguments, which the minifier copies byte for byte. Normalising
 * inside those would hide exactly the corruption the verbatim rules exist to
 * prevent — `content: "x  y"` vs `content: "x y"`, or a comment eaten out of
 * `url(x/*y*\/z.png)` — by rewriting both sides of the pair the same way.
 * Comments are recognised only outside those regions, both because a `/*`
 * inside a string is not a comment and because an apostrophe inside a comment
 * is not a quote.
 */
function normalizeRawText(text: string): string {
    let out = '';
    let pendingSpace = false;
    let i = 0;

    const flush = () => {
        if (!pendingSpace) return;
        pendingSpace = false;
        out += ' ';
    };

    while (i < text.length) {
        const char = text[i];

        if (/\s/.test(char)) {
            pendingSpace = true;
            i += 1;
            continue;
        }

        if (char === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end === -1 ? text.length : end + 2;
            pendingSpace = true;
            continue;
        }

        if (char === '"' || char === "'") {
            flush();
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === '\\') {
                    j += 2;
                    continue;
                }
                const inner = text[j];
                j += 1;
                if (inner === char) break;
            }
            out += text.slice(i, j);
            i = j;
            continue;
        }

        /*
         * A `url(` token, but only when it starts one: after an identifier
         * character it is the tail of something like `myurl(`, whose argument
         * IS ordinary CSS that the minifier re-spaces.
         */
        const previousIsIdent =
            !pendingSpace && out !== '' && /[\w-]/.test(out[out.length - 1]);
        if (!previousIsIdent && text.slice(i, i + 4).toLowerCase() === 'url(') {
            flush();
            const close = text.indexOf(')', i + 4);
            const end = close === -1 ? text.length : close + 1;
            out += text.slice(i, end);
            i = end;
            continue;
        }

        flush();
        out += char;
        i += 1;
    }

    flush();
    return out;
}

/** Strip positions and raw text, and neutralise whitespace/comments in values. */
function normalize(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(normalize);
    if (typeof node === 'string') return normalizeRawText(node);
    if (node === null || typeof node !== 'object') return node;
    const record = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        // `start`/`end`/`loc` are offsets into text the minifier shortens;
        // `content` is the verbatim stylesheet source, not parsed structure.
        if (key === 'start' || key === 'end' || key === 'loc') continue;
        if (key === 'content') continue;
        /*
         * The parser hands back an attribute selector's value with its quotes
         * already removed, so nothing here is raw CSS the minifier may re-space
         * — every byte is part of the matched string. Compare it untouched.
         */
        if (key === 'value' && record.type === 'AttributeSelector') {
            out[key] = value;
            continue;
        }
        out[key] = normalize(value);
    }
    return out;
}

function parseStylesheet(css: string): unknown {
    return normalize(parse(`<style>${css}</style>`, { modern: true }).css);
}

const { blocks, skipped } = collectStyleBlocks();

/*
 * An exact count, not a floor: a floor cannot tell "a package's stylesheets were
 * deleted" from "the check still runs". Update the number when a `<style>` block
 * is added or removed — a failure here is a prompt to confirm the new block is
 * covered, not a problem with the minifier.
 */
const EXPECTED_BLOCK_COUNT = 36;

describe('minifyCss preserves every component stylesheet in the repository', () => {
    it('found the stylesheets to check', () => {
        expect(blocks).toHaveLength(EXPECTED_BLOCK_COUNT);
    });

    it('skips only the wrapper runtime stylesheet, which is not parseable CSS', () => {
        // Length first, so a SECOND interpolated block in the same file — which
        // would repeat the same path — is reported as the count it is.
        expect(skipped).toHaveLength(1);
        expect(skipped.map((block) => block.file)).toEqual([
            '/core/src/lib/components/TriiiceratopsViewerElement.svelte',
        ]);
    });

    /*
     * The comparison above is only worth as much as its ability to fail. These
     * are hand-corrupted pairs — the kinds of damage a regression in the
     * minifier's scanning would do — asserted to compare UNEQUAL. Without the
     * quote-aware normalisation the last two of these compared equal, and a
     * broken `endOfString` or verbatim-copy path would have left this file
     * green.
     */
    it.each([
        [
            'a welded descendant combinator',
            '.a :global(.b){}',
            '.a:global(.b){}',
        ],
        [
            'welded calc() operators',
            '.a{width: calc(100% + 1px)}',
            '.a{width: calc(100%+1px)}',
        ],
        [
            'welded media query operators',
            '@media (min-width: 1px) and (max-width: 2px){.a{color: red}}',
            '@media (min-width: 1px)and(max-width: 2px){.a{color: red}}',
        ],
        [
            'whitespace collapsed inside a quoted value',
            '.a::before{content: "x  y"}',
            '.a::before{content: "x y"}',
        ],
        [
            'whitespace collapsed inside an attribute selector',
            '.a[title="x  y"]{color: red}',
            '.a[title="x y"]{color: red}',
        ],
        [
            'a comment eaten out of a url()',
            '.a{background: red url(x/*y*/z.png)}',
            '.a{background: red url(x z.png)}',
        ],
    ])('the comparison rejects %s', (_label, original, corrupted) => {
        expect(parseStylesheet(corrupted)).not.toEqual(
            parseStylesheet(original),
        );
    });

    it.each(blocks.map((block, index) => [`${block.file}#${index}`, block]))(
        '%s parses identically before and after minification',
        (_label, block) => {
            expect(parseStylesheet(minifyCss(block.css))).toEqual(
                parseStylesheet(block.css),
            );
        },
    );
});
