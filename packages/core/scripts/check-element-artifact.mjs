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
}

if (problems.length > 0) {
    console.error('check-element-artifact: bad build artifacts\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    `check-element-artifact: ${checked} dynamic element-bundle import(s) resolve; ` +
        `${ELEMENT_ARTIFACTS.length} artifact(s) carry the wrapper's attribute map ` +
        `and observe it.`,
);
