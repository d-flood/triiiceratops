#!/usr/bin/env node
/**
 * Per-theme WCAG 2.2 AA contrast check over the public `--tri-*` token pairings.
 *
 * The built-in themes express every color as `oklch()`, which is fully
 * computable, so this script resolves each theme's documented content/surface
 * token pairings (including `var()` indirection and `color-mix(in oklab, …)`
 * derived tokens) straight from `src/styles/themes.css`, converts the resolved
 * colors to sRGB, and asserts the WCAG contrast ratio meets AA.
 *
 * It is the single source of truth for the contrast logic: `contrast.test.ts`
 * imports {@link checkAllThemes} so the same check runs inside `pnpm test`, and
 * running this file directly (`node scripts/check-contrast.ts`, Node strips the
 * types) prints a table and exits non-zero on any failure for CI. It lives under
 * `scripts/` (never published) rather than in `src/lib`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const THEMES_CSS = resolvePath(scriptDir, '../src/styles/themes.css');

export const THEMES = ['light', 'dark', 'teal', 'dracula'] as const;
export type ThemeName = (typeof THEMES)[number];

/**
 * WCAG AA thresholds. Body/label text is normal size (4.5:1); a couple of
 * pairings are only ever rendered as large text or non-text UI glyphs (3:1).
 */
const AA_NORMAL = 4.5;
/** WCAG 2.2 — 1.4.11 Non-text Contrast: UI component boundaries, focus rings. */
const AA_NON_TEXT = 3;

export interface Pairing {
    fg: string;
    bg: string;
    min: number;
}

export interface ContrastResult {
    theme: ThemeName;
    fg: string;
    bg: string;
    ratio: number;
    min: number;
    pass: boolean;
}

interface Oklab {
    L: number;
    a: number;
    b: number;
}

type TokenEnv = Record<string, string>;

/**
 * Documented content/surface pairings that must meet AA in every theme.
 * `min` is the WCAG threshold for how that pairing is actually rendered.
 */
export const PAIRINGS: Pairing[] = [
    // Global content on each surface
    { fg: '--tri-content', bg: '--tri-viewer-bg', min: AA_NORMAL },
    { fg: '--tri-viewer-content', bg: '--tri-viewer-bg', min: AA_NORMAL },
    { fg: '--tri-content', bg: '--tri-panel-bg', min: AA_NORMAL },
    { fg: '--tri-panel-content', bg: '--tri-panel-bg', min: AA_NORMAL },
    { fg: '--tri-toolbar-content', bg: '--tri-toolbar-bg', min: AA_NORMAL },
    { fg: '--tri-gallery-content', bg: '--tri-gallery-bg', min: AA_NORMAL },
    { fg: '--tri-content', bg: '--tri-input-bg', min: AA_NORMAL },

    // Per-panel content on per-panel surface
    {
        fg: '--tri-metadata-panel-content',
        bg: '--tri-metadata-panel-bg',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-annotations-panel-content',
        bg: '--tri-annotations-panel-bg',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-search-panel-content',
        bg: '--tri-search-panel-bg',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-structures-panel-content',
        bg: '--tri-structures-panel-bg',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-collection-panel-content',
        bg: '--tri-collection-panel-bg',
        min: AA_NORMAL,
    },

    // Palette content pairs (button/badge labels on their fill)
    {
        fg: '--tri-color-primary-content',
        bg: '--tri-color-primary',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-color-neutral-content',
        bg: '--tri-color-neutral',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-color-success-content',
        bg: '--tri-color-success',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-color-warning-content',
        bg: '--tri-color-warning',
        min: AA_NORMAL,
    },
    {
        fg: '--tri-color-error-content',
        bg: '--tri-color-error',
        min: AA_NORMAL,
    },

    // Primary used as text/icon on a neutral panel surface
    { fg: '--tri-color-primary-text', bg: '--tri-panel-bg', min: AA_NORMAL },

    /*
     * The two indicators drawn OVER the image, each against the other's tone:
     * the surface's focus ring (outer band against inner) and the annotation
     * connector (ink against casing). One pairing, because both are the same
     * technique for the same reason, and both live or die by the same numbers.
     *
     * Not "the ring against the viewer background": the ring is drawn inside
     * the surface, where its neighbour is the canvas, i.e. arbitrary image
     * pixels (and with `transparentBackground` set, the host page's unknown
     * backdrop). No pairing against a token could describe what is actually
     * adjacent to it on screen. So the ring is two-tone and carries its own
     * contrast — `--tri-color-primary-text` outside, `--tri-viewer-bg` inside —
     * and THIS is the pairing that has to clear 3:1 (a focus indicator is a
     * non-text UI component, 1.4.11 / 2.4.11). It is checked rather than
     * assumed because the ring is a new affordance: the previous renderer
     * suppressed focus on this surface entirely.
     *
     * The connector line from an annotation's panel row to its shape crosses the
     * same unknown pixels and answers it the same way: the ink in
     * `--tri-color-primary-text` over a wider casing in `--tri-viewer-bg`
     * (`AnnotationOverlay.svelte`). It is a non-text indicator too, so 3:1 is its
     * threshold as well.
     */
    { fg: '--tri-color-primary-text', bg: '--tri-viewer-bg', min: AA_NON_TEXT },
];

// ---------------------------------------------------------------------------
// CSS block parsing
// ---------------------------------------------------------------------------

/** Extract `--tri-*` declarations from a CSS block body into a name→value map. */
function parseDecls(body: string): TokenEnv {
    const map: TokenEnv = {};
    const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        map[m[1]] = m[2].trim();
    }
    return map;
}

/** Return the body `{ … }` of the first CSS rule whose selector matches `test`. */
function findBlock(
    css: string,
    test: (selector: string) => boolean,
): string | null {
    // Strip comments so they don't leak into selector text.
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Walk brace-balanced top-level blocks so nested @media blocks are handled.
    let i = 0;
    while (i < css.length) {
        const open = css.indexOf('{', i);
        if (open === -1) break;
        const selector = css.slice(i, open).trim();
        let depth = 1;
        let j = open + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth++;
            else if (css[j] === '}') depth--;
            j++;
        }
        const body = css.slice(open + 1, j - 1);
        if (test(selector)) {
            return body;
        }
        i = j;
    }
    return null;
}

/**
 * Build a resolved token map for one theme by merging the default `:root`
 * block, the shared derived block, and the theme's own `[data-theme=…]` block.
 * Later sources win for concrete tokens; derived expressions resolve lazily.
 */
export function buildThemeEnv(css: string, theme: ThemeName): TokenEnv {
    const defaultBody = findBlock(
        css,
        (s) =>
            s.includes(':where(:root, :host)') && !s.includes('[data-theme]'),
    );
    const derivedBody = findBlock(css, (s) =>
        s.includes(':where(:root, :host, [data-theme])'),
    );
    const themeBody = findBlock(css, (s) =>
        s.trim().endsWith(`[data-theme='${theme}']`),
    );
    if (!defaultBody) throw new Error('default :root block not found');
    if (!derivedBody) throw new Error('derived token block not found');
    if (!themeBody) throw new Error(`theme block for "${theme}" not found`);

    // Concrete tokens: default light root, then theme block wins. Derived
    // expressions add gallery/input/per-panel/primary-text tokens.
    return {
        ...parseDecls(defaultBody),
        ...parseDecls(derivedBody),
        ...parseDecls(themeBody),
    };
}

// ---------------------------------------------------------------------------
// Value resolution: var(), color-mix(in oklab, …), oklch()
// ---------------------------------------------------------------------------

/** Split a function's argument list on top-level commas. */
function splitArgs(str: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of str) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** Parse `"<color> [<pct>%]"` from a color-mix argument. */
function parseMixColor(arg: string): [string, number | null] {
    const pctMatch = arg.match(/\s([\d.]+)%\s*$/);
    if (pctMatch && pctMatch.index !== undefined) {
        const pct = parseFloat(pctMatch[1]) / 100;
        return [arg.slice(0, pctMatch.index).trim(), pct];
    }
    return [arg.trim(), null];
}

/** Resolve a token/expression to an oklab color `{ L, a, b }`. */
export function resolveColor(
    env: TokenEnv,
    expr: string,
    seen: Set<string> = new Set(),
): Oklab {
    const value = expr.trim();

    if (value.startsWith('var(')) {
        const inner = value.slice(4, -1);
        const [name, ...fallback] = splitArgs(inner);
        if (seen.has(name)) {
            throw new Error(`circular var reference: ${name}`);
        }
        seen.add(name);
        const resolved = env[name];
        if (resolved !== undefined) return resolveColor(env, resolved, seen);
        if (fallback.length) return resolveColor(env, fallback.join(','), seen);
        throw new Error(`unresolved var: ${name}`);
    }

    if (value.startsWith('color-mix(')) {
        const inner = value.slice('color-mix('.length, -1);
        const args = splitArgs(inner);
        const space = args[0].trim();
        if (space !== 'in oklab' && space !== 'in oklch') {
            throw new Error(`unsupported color-mix space: ${space}`);
        }
        const [c1, p1] = parseMixColor(args[1]);
        const [c2, p2] = parseMixColor(args[2]);
        const colA = resolveColor(env, c1, new Set(seen));
        const colB = resolveColor(env, c2, new Set(seen));
        // Normalize weights (default 50/50, other = 100-given when one omitted).
        let w1: number;
        let w2: number;
        if (p1 == null && p2 == null) {
            w1 = 0.5;
            w2 = 0.5;
        } else if (p1 == null) {
            w2 = p2 as number;
            w1 = 1 - w2;
        } else if (p2 == null) {
            w1 = p1;
            w2 = 1 - w1;
        } else {
            w1 = p1;
            w2 = p2;
        }
        const sum = w1 + w2 || 1;
        w1 /= sum;
        w2 /= sum;
        return {
            L: colA.L * w1 + colB.L * w2,
            a: colA.a * w1 + colB.a * w2,
            b: colA.b * w1 + colB.b * w2,
        };
    }

    if (value.startsWith('oklch(')) {
        return oklchToOklab(value);
    }

    throw new Error(`unrecognized color value: ${value}`);
}

// ---------------------------------------------------------------------------
// Color math (oklch → oklab → linear sRGB → sRGB → WCAG luminance)
// ---------------------------------------------------------------------------

/** Parse an `oklch(L% C H)` string to oklab `{ L, a, b }`. */
export function oklchToOklab(str: string): Oklab {
    const inner = str.slice(str.indexOf('(') + 1, str.lastIndexOf(')'));
    const parts = inner.split('/')[0].trim().split(/\s+/);
    let L = parseFloat(parts[0]);
    if (parts[0].includes('%')) L /= 100;
    const C = parseFloat(parts[1]);
    const h = parseFloat(parts[2] ?? '0');
    const hr = (h * Math.PI) / 180;
    return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
}

/** oklab → linear sRGB (Björn Ottosson). */
function oklabToLinearSrgb({ L, a, b }: Oklab): {
    r: number;
    g: number;
    b: number;
} {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return {
        r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** linear-light channel → gamma-encoded sRGB (0–1). */
function linearToSrgb(c: number): number {
    c = clamp01(c);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** gamma sRGB channel → linear (WCAG relative-luminance linearization). */
function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an oklab color, via a real sRGB round-trip. */
export function relativeLuminance(oklab: Oklab): number {
    const lin = oklabToLinearSrgb(oklab);
    // Round-trip through gamma sRGB (as a display would) before re-linearizing.
    const r = srgbToLinear(linearToSrgb(lin.r));
    const g = srgbToLinear(linearToSrgb(lin.g));
    const b = srgbToLinear(linearToSrgb(lin.b));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two oklab colors. */
export function contrastRatio(fg: Oklab, bg: Oklab): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check every documented pairing across all four themes. */
export function checkAllThemes(
    css: string = readFileSync(THEMES_CSS, 'utf8'),
): ContrastResult[] {
    const results: ContrastResult[] = [];
    for (const theme of THEMES) {
        const env = buildThemeEnv(css, theme);
        for (const { fg, bg, min } of PAIRINGS) {
            const fgColor = resolveColor(env, env[fg] ?? `var(${fg})`);
            const bgColor = resolveColor(env, env[bg] ?? `var(${bg})`);
            const ratio = contrastRatio(fgColor, bgColor);
            results.push({
                theme,
                fg,
                bg,
                ratio: Math.round(ratio * 100) / 100,
                min,
                pass: ratio >= min,
            });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
    const results = checkAllThemes();
    const failures = results.filter((r) => !r.pass);

    for (const theme of THEMES) {
        console.log(`\n=== ${theme} ===`);
        for (const r of results.filter((x) => x.theme === theme)) {
            const status = r.pass ? 'PASS' : 'FAIL';
            console.log(
                `  [${status}] ${r.ratio.toFixed(2)} (min ${r.min}) ${r.fg} on ${r.bg}`,
            );
        }
    }

    console.log(
        `\n${results.length} pairings checked, ${failures.length} failing.`,
    );
    if (failures.length) {
        console.error('\nContrast check FAILED:');
        for (const f of failures) {
            console.error(
                `  ${f.theme}: ${f.fg} on ${f.bg} = ${f.ratio} (need ${f.min})`,
            );
        }
        process.exit(1);
    }
    console.log('All theme token pairings meet WCAG 2.2 AA.');
}

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolvePath(process.argv[1])
) {
    main();
}
