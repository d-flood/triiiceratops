/*
 * Build-time icon codegen (build tooling — never published).
 *
 * Reads the checked-in manifest (`scripts/icons.config.ts`), pulls the raw SVG
 * for each listed icon + weight from the dependency-free `@phosphor-icons/core`
 * devDependency, extracts the inner markup, and writes
 * `src/lib/generated/icons.ts` — a generated, gitignored module of SVG-inner
 * strings. `src/lib/components/Icon.svelte` owns the `<svg>` wrapper (sizing,
 * color, accessibility), so only the inner `<path>`/shape markup is stored here.
 *
 * The emitted table is SPARSE: every `CORE_ICONS` glyph is written under
 * `regular`, but only the glyphs that declare `bold`/`fill` are written under
 * those weights. That is why the emitted type keeps `regular` total while the
 * other weights are `Partial` — it is `Icon.svelte`'s `?? icons.regular[name]`
 * fallback that makes an absent weight degrade to the regular glyph rather than
 * render nothing. `scripts/check-icon-coverage.mjs` guards the difference.
 *
 * This replaces the `phosphor-svelte` runtime dependency (whose required `vite`
 * peer dependency is structurally unsuitable for a library) with build-time
 * generation. Run directly: `node ./scripts/generate-icons.ts` (Node strips the
 * TS types). Runs automatically before build/check/test/dev.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CORE_ICONS, ICON_WEIGHTS } from './icons.config.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(here, '..');

/**
 * Resolve an `@phosphor-icons/core` asset through its exports map (which exposes
 * `./assets/<weight>/*.svg`), so this works under pnpm's nested store layout
 * without hard-coding a node_modules path. Returns null when the asset is absent.
 */
function resolveAsset(weight: string, file: string): string | null {
    try {
        return require.resolve(`@phosphor-icons/core/assets/${weight}/${file}`);
    } catch {
        return null;
    }
}

/** PascalCase Phosphor name -> kebab-case asset base (e.g. FilePdf -> file-pdf). */
function toKebab(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

/** Asset filename for a name+weight. Regular has no weight suffix. */
function assetFile(name: string, weight: string): string {
    const base = toKebab(name);
    return weight === 'regular' ? `${base}.svg` : `${base}-${weight}.svg`;
}

/** Extract the inner markup (paths/shapes) from a Phosphor `<svg>…</svg>`. */
function extractInner(svg: string, source: string): string {
    const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
    if (!match) {
        throw new Error(`Could not parse SVG contents from ${source}`);
    }
    return match[1].trim();
}

/** One number in path data. Arc flags are bare integers and round to themselves. */
const PATH_NUMBER = /-?(?:\d+\.\d+|\.\d+|\d+)/g;

/**
 * Round to one decimal, which is ~0.4% of Phosphor's 256-unit viewBox — well
 * under a pixel at the sizes the chrome renders at. `String` drops a trailing
 * `.0` and prints -0 as 0, and always emits a leading digit.
 */
function roundCoordinate(literal: string): string {
    return String(Math.round(Number(literal) * 10) / 10);
}

/**
 * Round the coordinates in one `d` attribute value. Path data may separate two
 * numbers with nothing but the second one's sign or decimal point (`-.26.25`,
 * `c.35.79`); since a rounded number can lose either, adjacent numbers get an
 * explicit comma so no pair can merge into one.
 */
function roundPathData(d: string): string {
    let out = '';
    let cut = 0;
    for (const match of d.matchAll(PATH_NUMBER)) {
        const gap = d.slice(cut, match.index);
        const rounded = roundCoordinate(match[0]);
        out += gap;
        if (gap === '' && cut > 0 && !rounded.startsWith('-')) out += ',';
        out += rounded;
        cut = match.index + match[0].length;
    }
    return out + d.slice(cut);
}

/** Shrink the markup by rounding coordinates, scoped to `d` attribute values. */
function roundCoordinates(inner: string): string {
    return inner.replace(
        /\bd="([^"]*)"/g,
        (_, d: string) => `d="${roundPathData(d)}"`,
    );
}

const coreNames = Object.keys(CORE_ICONS) as (keyof typeof CORE_ICONS)[];

/** Names to generate for one weight: everything at `regular`, declarers elsewhere. */
function namesForWeight(weight: string): (keyof typeof CORE_ICONS)[] {
    if (weight === 'regular') return coreNames;
    return coreNames.filter((name) =>
        (CORE_ICONS[name] as readonly string[]).includes(weight),
    );
}

const nameUnion = coreNames.map((n) => JSON.stringify(n)).join(' | ');
const weightUnion = ICON_WEIGHTS.map((w) => JSON.stringify(w)).join(' | ');

const lines: string[] = [];
lines.push('/* eslint-disable */');
lines.push('/*');
lines.push(' * GENERATED FILE — DO NOT EDIT.');
lines.push(
    ' * Produced by scripts/generate-icons.ts from scripts/icons.config.ts',
);
lines.push(
    ' * and @phosphor-icons/core. Gitignored; regenerated on every build.',
);
lines.push(' */');
lines.push(`export type IconName = ${nameUnion};`);
lines.push(`export type IconWeight = ${weightUnion};`);
lines.push('');
lines.push(
    '/* Sparse: `regular` is total, the other weights carry only declarers. */',
);
lines.push(
    'type IconTable = Record<IconWeight, Partial<Record<IconName, string>>> & {',
);
lines.push('    regular: Record<IconName, string>;');
lines.push('};');
lines.push('');
lines.push('export const icons: IconTable = {');

let generated = 0;
for (const weight of ICON_WEIGHTS) {
    lines.push(`    ${weight}: {`);
    for (const name of namesForWeight(weight)) {
        const file = resolveAsset(weight, assetFile(name, weight));
        if (!file) {
            throw new Error(
                `Missing Phosphor asset for ${name} (${weight}): expected @phosphor-icons/core/assets/${weight}/${assetFile(name, weight)}`,
            );
        }
        const inner = roundCoordinates(
            extractInner(readFileSync(file, 'utf8'), file),
        );
        lines.push(
            `        ${JSON.stringify(name)}: ${JSON.stringify(inner)},`,
        );
        generated += 1;
    }
    lines.push('    },');
}
lines.push('};');
lines.push('');

const outDir = join(coreRoot, 'src', 'lib', 'generated');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'icons.ts');
writeFileSync(outFile, lines.join('\n'), 'utf8');

const perWeight = ICON_WEIGHTS.map(
    (w) => `${w}: ${namesForWeight(w).length}`,
).join(', ');

console.log(
    `generate-icons: wrote ${generated} SVG string(s) for ${coreNames.length} core icon(s) (${perWeight}) to src/lib/generated/icons.ts`,
);
