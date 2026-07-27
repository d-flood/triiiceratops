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
 * This replaces the `phosphor-svelte` runtime dependency (whose required `vite`
 * peer dependency is structurally unsuitable for a library) with build-time
 * generation. Run directly: `node ./scripts/generate-icons.ts` (Node strips the
 * TS types). Runs automatically before build/check/test/dev.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ICON_NAMES, ICON_WEIGHTS } from './icons.config.ts';

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

const nameUnion = ICON_NAMES.map((n) => JSON.stringify(n)).join(' | ');
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
    'export const icons: Record<IconWeight, Record<IconName, string>> = {',
);

let generated = 0;
for (const weight of ICON_WEIGHTS) {
    lines.push(`    ${weight}: {`);
    for (const name of ICON_NAMES) {
        const file = resolveAsset(weight, assetFile(name, weight));
        if (!file) {
            throw new Error(
                `Missing Phosphor asset for ${name} (${weight}): expected @phosphor-icons/core/assets/${weight}/${assetFile(name, weight)}`,
            );
        }
        const inner = extractInner(readFileSync(file, 'utf8'), file);
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

console.log(
    `generate-icons: wrote ${generated} SVG string(s) (${ICON_NAMES.length} icons × ${ICON_WEIGHTS.length} weights) to src/lib/generated/icons.ts`,
);
