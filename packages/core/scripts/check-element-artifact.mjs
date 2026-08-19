/*
 * Guard: the framework substrate's lazy registration imports the self-contained
 * element bundle by RELATIVE specifier, and that artifact is produced by a
 * LATER build step than the module containing the import.
 *
 * `build:lib` (svelte-package) emits `dist/framework/registration.js`, whose
 * `import('../triiiceratops-element.js')` resolves to `dist/triiiceratops-element.js`
 * — written afterwards by `build:element`. Nothing in the compile of the former
 * can verify the latter exists, and `svelte-package` clears `dist/`, so a
 * `build:lib` run that is not followed by `build:element` leaves a published
 * tree whose React and Vue entry points fail at first mount with a module-not-
 * found error. That failure would surface only in a packed consumer.
 *
 * This asserts, after `build:element`, that every relative specifier the
 * substrate dynamic-imports resolves to a file that is actually on disk.
 *
 * It then asserts the artifacts themselves are worth importing: each must carry
 * the wrapper's custom-element attribute map. That failure mode is visible
 * nowhere else. Both entry points read the compiler's `element` static through
 * an `as unknown as { element: CustomElementConstructor }` cast, which erases
 * the only type-level evidence it exists, so a degraded element type-checks
 * clean; and `scripts/size-check.mjs` fails only on growth, so a bundle that
 * LOST work reads to it as an improvement.
 *
 * This script also used to count `create_custom_element(…)` call shapes, to
 * catch a global `compilerOptions.customElement: true` compiling all 34
 * components as custom elements. It cannot: with the terser pass added in
 * `src/packaging/terserElement.ts`, a single call site gets the helper INLINED,
 * so the correct artifact has no call left to match while the regression keeps
 * the helper shared and every one of its 34 calls intact — the heuristic read 0
 * for right and 34 for wrong. The count moved to `wrapperCustomElementGuard` in
 * `src/packaging/elementCompileOptions.ts`, which counts the compiler's own
 * output during the same `build:element` run and gets an exact number.
 *
 * Run directly: `node ./scripts/check-element-artifact.mjs`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Modules that dynamic-import a build artifact, and what they must resolve. */
const IMPORTERS = [path.resolve('dist', 'framework', 'registration.js')];

const DYNAMIC_IMPORT_RE = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const problems = [];
let checked = 0;

for (const importer of IMPORTERS) {
    if (!existsSync(importer)) {
        problems.push(
            `${path.relative(process.cwd(), importer)} is missing — run \`pnpm build:lib\` first.`,
        );
        continue;
    }
    const source = readFileSync(importer, 'utf8');
    const specifiers = [...source.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[1]);
    if (specifiers.length === 0) {
        problems.push(
            `${path.relative(process.cwd(), importer)} contains no relative dynamic import; ` +
                `the element bundle is no longer loaded by relative specifier.`,
        );
        continue;
    }
    for (const specifier of specifiers) {
        const resolved = path.resolve(path.dirname(importer), specifier);
        checked++;
        if (!existsSync(resolved)) {
            problems.push(
                `${path.relative(process.cwd(), importer)} imports "${specifier}", but ` +
                    `${path.relative(process.cwd(), resolved)} does not exist. ` +
                    `Run \`pnpm build:element\` after \`pnpm build:lib\`.`,
            );
        }
    }
}

/** Both self-contained element bundles, from `build:element`. */
const ELEMENT_ARTIFACTS = [
    path.resolve('dist', 'triiiceratops-element.iife.js'),
    path.resolve('dist', 'triiiceratops-element.js'),
];

/**
 * An entry of the `props_definition` object Svelte's custom-element codegen
 * builds from `<svelte:options customElement={{ props: … }} />`. Nothing else in
 * the bundle emits `attribute: '…'`, and the keys and string values here are
 * data the minifier must preserve.
 *
 * This is the presence signal, and it is finer-grained than "is there an element
 * class". Deleting the wrapper's `<svelte:options>` block still leaves a
 * registered element — `dynamicCompileOptions` upgrades the file either way —
 * but one with no attribute map at all: `manifest-id`, `canvas-id`, `theme` and
 * the rest silently stop being attributes, and the element goes on registering
 * as if nothing happened.
 *
 * This is ALSO the only check here that notices terser property mangling. That
 * was built and measured: with `mangle: { properties: true }` in
 * `src/packaging/terserElement.ts`, the artifact keeps `"manifest-id"` as a
 * string and keeps `static get observedAttributes()` — the getter name is in
 * terser's `domprops` reserved list, and `mangle.properties.builtins` defaults
 * to `false` — but every `attribute:` key is renamed away, and this regex drops
 * to zero matches.
 */
const CUSTOM_ELEMENT_ATTRIBUTE = /attribute\s*:\s*['"][a-z-]+['"]/g;

/**
 * The `static get observedAttributes()` of Svelte's custom-element base class:
 * the mechanism that turns the map above into observed attributes.
 *
 * A presence assertion on the base class, nothing subtler. Both minifier shapes
 * keep the name verbatim because it is spec-defined, so what this catches is the
 * base class going missing or being replaced wholesale — a Svelte custom-element
 * codegen change, not a minifier setting.
 */
const OBSERVED_ATTRIBUTES = /static\s+get\s+observedAttributes\s*\(\s*\)/;

/*
 * Reverse-coverage guard for `src/packaging/dropLightDomOnly.ts`.
 *
 * That plugin drops the preflight rules the shadow root cannot match, on the
 * standing claim that no component in this bundle emits `<hr>`, `<table>`,
 * `<summary>` and the rest. The plugin failing to run is caught by the raw
 * metric in `scripts/size-check.mjs`. The opposite drift — a component starting
 * to emit one of those elements, so a reset that used to be unreachable is now
 * load-bearing and gone — has no signal at all: the element renders unstyled,
 * degraded rather than absent, in the shipped viewer only.
 *
 * The risk is not hypothetical. `src/demo/` reaches for `<details>/<summary>`
 * and `<optgroup>` one directory away from the library tree, and demo chrome
 * has leaked back into that tree before.
 *
 * TWO LIMITS, deliberately not papered over:
 *
 * 1. It covers only the marked rules whose selectors name element types. The
 *    marked `::-webkit-*` and `::file-selector-button` rules reset the shadow
 *    parts of input types, and mapping a pseudo-element back to the `<input
 *    type>` that grows it would mean hand-writing a second list — reintroducing
 *    the exact drift the marker-on-the-rule design exists to avoid. Those rules
 *    are also the cheap ones to be wrong about: a probe across Chromium,
 *    Firefox and WebKit measured them as no-ops or ≤4px.
 *
 * 2. It reads core's own artifacts. A PLUGIN bundle that emits `<table>` into
 *    the shadow root is still not caught. That gap is in the trim's contract,
 *    not in this guard: plugins mount into a root whose reset core owns.
 */
const MARKER_RULE = /\/\*\s*light-dom-only\s*\*\/\s*([^{}]+?)\s*\{/g;
const ATTRIBUTE_SELECTOR = /\[[^\]]*\]/g;
const TYPE_SELECTOR = /(?:^|[\s>+~(])([a-z][a-z0-9]*)/g;

/** Split a selector list on its top-level commas; `:is(a, b)` is not a list. */
function selectorBranches(selector) {
    const branches = [''];
    let depth = 0;
    for (const char of selector) {
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        else if (char === ',' && depth === 0) {
            branches.push('');
            continue;
        }
        branches[branches.length - 1] += char;
    }
    return branches;
}

/**
 * The element types a selector branch requires to be in the tree before it can
 * match anything. Names inside `:is()`/`:where()` count — `:where(select) x`
 * still needs a `<select>`.
 */
function requiredTypes(branch) {
    return [
        ...branch.replace(ATTRIBUTE_SELECTOR, ' ').matchAll(TYPE_SELECTOR),
    ].map((match) => match[1]);
}

const preflightPath = path.resolve('src', 'styles', 'preflight.css');
/** `{ selector, types }` per marked rule that names element types at all. */
const markedRules = [];
let markerCount = 0;
for (const [, selector] of readFileSync(preflightPath, 'utf8').matchAll(
    MARKER_RULE,
)) {
    markerCount++;
    const branches = selectorBranches(selector).map(requiredTypes);
    // A branch naming no element type (a bare `::-webkit-*` reset) could match
    // anywhere, so the rule as a whole tells us nothing.
    if (branches.some((types) => types.length === 0)) continue;
    markedRules.push({
        selector: selector.replace(/\s+/g, ' '),
        branches,
    });
}

if (markerCount === 0 || markedRules.length === 0) {
    problems.push(
        `${path.relative(process.cwd(), preflightPath)} yielded ${markerCount} ` +
            `light-dom-only marker(s) and ${markedRules.length} with element-type ` +
            `selectors. This guard has silently become a no-op: either the markers ` +
            `are gone, or their formatting no longer matches MARKER_RULE here.`,
    );
}

for (const artifact of ELEMENT_ARTIFACTS) {
    const name = path.relative(process.cwd(), artifact);
    if (!existsSync(artifact)) {
        problems.push(`${name} is missing — run \`pnpm build:element\`.`);
        continue;
    }
    const code = readFileSync(artifact, 'utf8');

    if ((code.match(CUSTOM_ELEMENT_ATTRIBUTE)?.length ?? 0) === 0) {
        problems.push(
            `${name} declares no custom-element attributes: the wrapper's ` +
                `<svelte:options customElement={{ props: … }} /> block did not reach ` +
                `the bundle. <triiiceratops-viewer> would still register, and would ` +
                `ignore manifest-id, canvas-id, theme and every other ` +
                `attribute. The other way to get here is terser property ` +
                `mangling: check that \`mangle\` in ` +
                `src/packaging/terserElement.ts has not grown a ` +
                `\`properties\` setting.`,
        );
        continue;
    }

    if (!OBSERVED_ATTRIBUTES.test(code)) {
        problems.push(
            `${name} declares custom-element attributes but no ` +
                `\`static get observedAttributes()\`, so nothing ever observes ` +
                `them. Svelte's custom-element base class is not in this ` +
                `bundle, or no longer declares the getter under that name.`,
        );
    }

    // Compiled Svelte templates keep tag names verbatim, so an opening tag in
    // the bundle is a reliable signal the element can reach the shadow root.
    const emits = (tag) => new RegExp(`<${tag}(?![a-z0-9-])`, 'i').test(code);
    for (const { selector, branches } of markedRules) {
        // The rule is unreachable as long as every branch is still missing at
        // least one of the element types it needs.
        if (branches.some((types) => types.every(emits))) {
            problems.push(
                `${name} emits <${[...new Set(branches.flat())].filter(emits).join('>, <')}>, ` +
                    `but src/styles/preflight.css marks \`${selector}\` light-dom-only, ` +
                    `so src/packaging/dropLightDomOnly.ts strips that reset from this ` +
                    `bundle. The element would render unstyled in the shadow root. ` +
                    `Either stop emitting it, or delete the marker and re-baseline ` +
                    `\`size-baseline.json\`.`,
            );
        }
    }
}

if (problems.length > 0) {
    console.error('check-element-artifact: bad build artifacts\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    `check-element-artifact: ${checked} dynamic element-bundle import(s) resolve; ` +
        `${ELEMENT_ARTIFACTS.length} artifact(s) carry the wrapper's attribute map ` +
        `and observe it, and emit none of the ${markerCount} light-dom-only ` +
        `reset(s)' ${markedRules.length} element-type selector(s).`,
);
