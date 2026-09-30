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

const ARITY: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
};

/** Split `d` into commands, each with its numbers grouped into segments. */
function parsePath(d: string): { cmd: string; segments: number[][] }[] {
    const commands: { cmd: string; segments: number[][] }[] = [];
    let rest = d;
    for (;;) {
        const head = rest.match(/^[\s,]*([a-zA-Z])/);
        if (!head) break;
        rest = rest.slice(head[0].length);
        const cmd = head[1];
        const arity = ARITY[cmd.toLowerCase()];
        const segments: number[][] = [];
        do {
            const segment: number[] = [];
            for (let i = 0; i < arity; i++) {
                const flag = cmd.toLowerCase() === 'a' && (i === 3 || i === 4);
                const token = rest.match(
                    flag
                        ? /^[\s,]*([01])/
                        : /^[\s,]*(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/,
                );
                if (!token) {
                    if (i === 0 && segments.length > 0) break;
                    throw new Error(`Could not parse path data: ${d}`);
                }
                rest = rest.slice(token[0].length);
                segment.push(Number(token[1]));
            }
            if (segment.length < arity) break;
            segments.push(segment);
        } while (arity > 0);
        commands.push({ cmd, segments });
    }
    if (rest.trim() !== '') throw new Error(`Could not parse path data: ${d}`);
    return commands;
}

/**
 * Rounds every point to an integer on Phosphor's 256-unit grid. A relative
 * delta is taken between consecutive ROUNDED absolute points rather than
 * rounded itself, so rounding error never accumulates along a path.
 */
function roundPathData(d: string): string {
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let rx = 0;
    let ry = 0;
    let rStartX = 0;
    let rStartY = 0;
    let out = '';
    for (const { cmd, segments } of parsePath(d)) {
        const lower = cmd.toLowerCase();
        const relative = cmd === lower;
        out += cmd;
        segments.forEach((segment, index) => {
            const nums: number[] = [];
            const point = (px: number, py: number) => {
                const ax = relative ? x + px : px;
                const ay = relative ? y + py : py;
                const qx = Math.round(ax);
                const qy = Math.round(ay);
                nums.push(relative ? qx - rx : qx, relative ? qy - ry : qy);
                return [ax, ay, qx, qy];
            };
            let end: number[];
            if (lower === 'h') {
                const ax = relative ? x + segment[0] : segment[0];
                const qx = Math.round(ax);
                nums.push(relative ? qx - rx : qx);
                end = [ax, y, qx, ry];
            } else if (lower === 'v') {
                const ay = relative ? y + segment[0] : segment[0];
                const qy = Math.round(ay);
                nums.push(relative ? qy - ry : qy);
                end = [x, ay, rx, qy];
            } else if (lower === 'a') {
                nums.push(
                    Math.round(segment[0]),
                    Math.round(segment[1]),
                    Math.round(segment[2]),
                    segment[3],
                    segment[4],
                );
                end = point(segment[5], segment[6]);
            } else if (lower === 'z') {
                end = [startX, startY, rStartX, rStartY];
            } else {
                for (let i = 0; i < segment.length - 2; i += 2) {
                    point(segment[i], segment[i + 1]);
                }
                end = point(
                    segment[segment.length - 2],
                    segment[segment.length - 1],
                );
            }
            [x, y, rx, ry] = end;
            if (lower === 'm' && index === 0) {
                [startX, startY, rStartX, rStartY] = end;
            }
            nums.forEach((n, i) => {
                const text = String(n);
                if ((i > 0 || index > 0) && !text.startsWith('-')) out += ',';
                out += text;
            });
        });
    }
    return out;
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
