/**
 * Guard: the generated icon table is SPARSE, and a hole in it is invisible.
 *
 * `Icon.svelte` resolves a glyph with `icons[weight]?.[name] ?? icons.regular[name]`.
 * The dynamic index is what lets the table drop the 100+ entries nothing renders
 * — no bundler can tree-shake a table indexed by a runtime string — and it is
 * also what makes a missing entry silent: an absent weight degrades to the
 * regular glyph, and an absent NAME renders `undefined` into `{@html}`, i.e. an
 * empty square. Neither is a build error, a type error, or a byte-count change
 * anyone would notice.
 *
 * So this re-derives, from the source, every (name, weight) pair the core chrome
 * and the shared UI package actually render, and asserts each one resolves in
 * `src/lib/generated/icons.ts`. It runs at the head of `build:element`, before
 * the bundles are produced.
 *
 * It also asserts the reverse — that nothing in the table goes unrendered —
 * because the same dynamic index that makes a hole silent makes a surplus entry
 * unshakeable: it ships in every element bundle whether or not anyone asks for
 * it. The two directions together mean the manifest equals what the scanned
 * roots render.
 *
 * Four things keep it from passing vacuously:
 *
 *   1. It must find `<Icon>` usages at all. A scan that matched nothing — a moved
 *      component directory, a renamed element — fails instead of reporting
 *      "0 missing".
 *   2. A dynamic `name={…}` binding must be resolvable to at least one glyph
 *      literal in its own file. `ThumbnailGallery`'s expand/collapse caret and
 *      `ViewerControls`'s nav caret both pick a name at runtime; the guard
 *      requires EVERY manifest name that appears as a literal anywhere in such a
 *      file, so it over-approximates rather than guessing the branch taken.
 *   3. `PanelStackSection` is the one dynamic name whose candidates are not in
 *      its own file: it renders `<Icon name={panel.iconName}>` from a descriptor
 *      table built elsewhere. Those resolve instead to every glyph literal
 *      assigned to an `iconName` field in a `.svelte` file under the scanned
 *      roots — the same over-approximation, widened to the seam. An empty
 *      candidate set (a renamed field, a moved table) fails rather than passing
 *      quietly. The match is pinned to `panel.iconName` rather than any
 *      `…iconName` expression so that a second component with a same-named field
 *      keeps rule 2's narrower file-scoped candidates instead of silently
 *      inheriting this one's repo-wide set.
 *   4. A dynamic `weight={…}` binding is a hard failure, full stop. A computed
 *      weight could ask for one this file cannot predict, which is precisely the
 *      case sparseness cannot survive.
 *
 * Run directly: `node ./scripts/check-icon-coverage.mjs`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CORE_ICONS, ICON_WEIGHTS, KNOWN_ICON_NAMES } from './icons.config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(here, '..');
const repoRoot = path.resolve(coreRoot, '..', '..');

/**
 * Source trees whose `<Icon>` usages resolve through core's generated table.
 * The library tree only: the playground at `apps/demo` carries its own glyph
 * table and renders it through `DemoIcon`, so counting its usages here would
 * hold demo-only chrome against the manifest in both directions.
 */
const ROOTS = [
    path.join(coreRoot, 'src', 'lib'),
    path.join(repoRoot, 'packages', 'ui', 'src'),
];

const GENERATED = path.join(coreRoot, 'src', 'lib', 'generated', 'icons.ts');

const rel = (p) => path.relative(repoRoot, p);

const problems = [];

/* ------------------------------------------------------------------ sources */

function collectSvelteFiles(dir) {
    const found = [];
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            found.push(...collectSvelteFiles(full));
        } else if (entry.endsWith('.svelte')) {
            found.push(full);
        }
    }
    return found;
}

/**
 * Blank out comments, preserving every offset and line break so the scanners
 * below can still slice the original positions. Component doc comments in this
 * repo quote `<Icon …>` as prose — a scan that read them would demand glyphs no
 * one renders, and (worse) report a name attribute missing from an example.
 */
function stripComments(text) {
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    return text
        .replace(/<!--[\s\S]*?-->/g, blank)
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(
            /(^|[^:\w])\/\/[^\n]*/g,
            (m, lead) => lead + blank(m.slice(lead.length)),
        );
}

const sources = [];
for (const root of ROOTS) {
    if (!existsSync(root)) {
        problems.push(`source root ${rel(root)} does not exist.`);
        continue;
    }
    for (const file of collectSvelteFiles(root)) {
        sources.push({
            file,
            text: stripComments(readFileSync(file, 'utf8')),
        });
    }
}

/* ------------------------------------------------------------------ parsing */

/**
 * Slice out one element's attribute text, brace- and quote-aware: an attribute
 * value like `{cond ? 'a' : 'b'}` or an arrow function can contain `>`, so the
 * tag cannot be matched by a regex that stops at the first one.
 */
function readTag(text, start) {
    let depth = 0;
    let quote = null;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0) return text.slice(start, i);
    }
    return null;
}

/** Every `<Icon …>` element in a file, as raw attribute text. */
function iconTags(text) {
    const tags = [];
    const re = /<Icon(?=[\s/>])/g;
    for (const match of text.matchAll(re)) {
        const body = readTag(text, match.index + '<Icon'.length);
        if (body === null) return null;
        tags.push(body);
    }
    return tags;
}

/**
 * Read one attribute: `{ kind: 'literal', value }` for `x="y"`,
 * `{ kind: 'binding', value }` for `x={expr}` or the `{x}` shorthand, or null
 * when the attribute is absent.
 */
function readAttribute(body, name) {
    const literal = body.match(
        new RegExp(
            `(?:^|\\s)${name}\\s*=\\s*"([^"]*)"|(?:^|\\s)${name}\\s*=\\s*'([^']*)'`,
        ),
    );
    if (literal) {
        return { kind: 'literal', value: literal[1] ?? literal[2] };
    }
    const bound = body.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*\\{`));
    if (bound) {
        const open = bound.index + bound[0].length - 1;
        const expr = readBraced(body, open);
        return { kind: 'binding', value: expr === null ? '?' : expr.trim() };
    }
    if (new RegExp(`(?:^|\\s)\\{\\s*${name}\\s*\\}`).test(body)) {
        return { kind: 'binding', value: name };
    }
    return null;
}

/** Contents of a `{ … }` starting at `open`, nesting-aware. */
function readBraced(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) return text.slice(open + 1, i);
        }
    }
    return null;
}

/* ----------------------------------------------------------- required pairs */

const knownNames = new Set(KNOWN_ICON_NAMES);

/**
 * Glyph names a panel descriptor hands to `PanelStackSection`. The field is
 * typed `IconName`, so `svelte-check` already pins the domain; what the guard
 * adds is the WEIGHT the section renders them at, which no type can see.
 */
const descriptorNames = new Set();
for (const { text } of sources) {
    for (const match of text.matchAll(
        /\biconName\s*:\s*'([A-Za-z]+)'|\biconName\s*:\s*"([A-Za-z]+)"/g,
    )) {
        const value = match[1] ?? match[2];
        if (knownNames.has(value)) descriptorNames.add(value);
    }
}

const required = new Map(); // name -> Set<weight>

function require_(name, weight, where) {
    if (!required.has(name)) required.set(name, new Map());
    const weights = required.get(name);
    if (!weights.has(weight)) weights.set(weight, new Set());
    weights.get(weight).add(where);
}

/** Manifest glyph names appearing as string literals anywhere in a file. */
function literalNamesIn(text) {
    const found = new Set();
    for (const match of text.matchAll(/'([A-Za-z]+)'|"([A-Za-z]+)"/g)) {
        const value = match[1] ?? match[2];
        if (knownNames.has(value)) found.add(value);
    }
    return found;
}

let usages = 0;

for (const { file, text } of sources) {
    const tags = iconTags(text);
    if (tags === null) {
        problems.push(
            `${rel(file)}: an <Icon …> tag is unterminated; the guard cannot read its attributes.`,
        );
        continue;
    }

    for (const body of tags) {
        usages++;
        const where = rel(file);

        // --- weight
        const weightAttr = readAttribute(body, 'weight');
        let weights;
        if (weightAttr === null) {
            weights = ['regular'];
        } else if (weightAttr.kind === 'literal') {
            if (!ICON_WEIGHTS.includes(weightAttr.value)) {
                problems.push(
                    `${where}: <Icon weight="${weightAttr.value}"> is not one of ${ICON_WEIGHTS.join(', ')}.`,
                );
                continue;
            }
            weights = [weightAttr.value];
        } else {
            problems.push(
                `${where}: <Icon weight={${weightAttr.value}}> is a dynamic weight binding. ` +
                    `The generated table is sparse, so a computed weight can silently ` +
                    `fall back to the regular glyph. Use a literal weight.`,
            );
            continue;
        }

        // --- name
        const nameAttr = readAttribute(body, 'name');
        if (nameAttr === null) {
            problems.push(`${where}: <Icon> has no name attribute.`);
            continue;
        }
        let names;
        if (nameAttr.kind === 'literal') {
            names = [nameAttr.value];
        } else if (/^panel\.iconName$/.test(nameAttr.value)) {
            names = [...descriptorNames];
            if (names.length === 0) {
                problems.push(
                    `${where}: <Icon name={${nameAttr.value}}> reads a panel descriptor's ` +
                        `glyph, but no \`iconName: '…'\` literal exists under the scanned ` +
                        `roots, so the guard cannot tell which glyphs the panel headers ` +
                        `render. Keep the descriptor table's names as literals.`,
                );
                continue;
            }
        } else if (/^[A-Za-z_$][\w$]*$/.test(nameAttr.value)) {
            names = [...literalNamesIn(text)];
            if (names.length === 0) {
                problems.push(
                    `${where}: <Icon name={${nameAttr.value}}> is dynamic, but the file ` +
                        `contains no glyph-name string literals, so the guard cannot tell ` +
                        `which glyphs it renders. Keep the candidate names as literals in ` +
                        `this file.`,
                );
                continue;
            }
        } else {
            problems.push(
                `${where}: <Icon name={${nameAttr.value}}> is not a bare identifier. ` +
                    `The guard resolves a dynamic name from the glyph literals in its own ` +
                    `file; assign the name to a variable first.`,
            );
            continue;
        }

        for (const name of names) {
            for (const weight of weights) require_(name, weight, where);
        }
    }
}

if (usages === 0) {
    problems.push(
        `no <Icon …> usages found under ${ROOTS.map(rel).join(', ')}; ` +
            `the guard would pass vacuously.`,
    );
}

/* ---------------------------------------------------------- resolve against */

if (!existsSync(GENERATED)) {
    problems.push(
        `${rel(GENERATED)} is missing — run \`pnpm gen:icons\` before this guard.`,
    );
}

let icons = null;
if (existsSync(GENERATED)) {
    ({ icons } = await import(pathToFileURL(GENERATED).href));
}

if (icons) {
    for (const [name, weights] of [...required].sort()) {
        for (const [weight, where] of [...weights].sort()) {
            if (typeof icons[weight]?.[name] === 'string') continue;
            const declared = CORE_ICONS[name];
            const hint =
                declared === undefined
                    ? `add "${name}" to CORE_ICONS in scripts/icons.config.ts`
                    : `add "${weight}" to CORE_ICONS.${name} in scripts/icons.config.ts`;
            problems.push(
                `missing glyph ${name} (${weight}), rendered by ${[...where].sort().join(', ')} — ${hint}.`,
            );
        }
    }
}

/* ------------------------------------------------- and nothing left over */

/*
 * The reverse direction, in two checks. The pair-level one skips `regular`
 * because the generator emits it for EVERY manifest glyph — it is the weight
 * `Icon.svelte` falls back to, so a glyph rendered only at `bold` still has an
 * unasked-for regular entry by design. Check 1 covers those glyphs by name, so
 * an entirely surplus glyph is still caught at whatever weights it was given.
 */
const scanned = ROOTS.map(rel).join(', ');

if (icons) {
    for (const name of Object.keys(icons.regular).sort()) {
        if (required.has(name)) continue;
        problems.push(
            `surplus glyph ${name}: generated, but nothing under ${scanned} ` +
                `renders it at any weight — remove "${name}" from CORE_ICONS in ` +
                `scripts/icons.config.ts.`,
        );
    }
    for (const weight of ICON_WEIGHTS) {
        if (weight === 'regular') continue;
        for (const name of Object.keys(icons[weight]).sort()) {
            const rendered = required.get(name);
            // A name rendered nowhere at all is check 1's to report, once.
            if (rendered === undefined || rendered.has(weight)) continue;
            problems.push(
                `surplus glyph ${name} (${weight}): generated, but nothing under ` +
                    `${scanned} renders it at that weight — remove "${weight}" from ` +
                    `CORE_ICONS.${name} in scripts/icons.config.ts.`,
            );
        }
    }
}

/* ---------------------------------------------------------------- reporting */

if (problems.length > 0) {
    console.error(
        'check-icon-coverage: the icon table and the chrome disagree\n',
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

const pairs = [...required.values()].reduce((n, w) => n + w.size, 0);
const counts = ICON_WEIGHTS.map(
    (w) => `${w}: ${Object.keys(icons[w]).length}`,
).join(', ');
console.log(
    `check-icon-coverage: ${pairs} rendered (glyph, weight) pair(s) across ${usages} <Icon> usage(s) ` +
        `resolve in the generated table (${counts}).`,
);
