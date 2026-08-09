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
 * the wrapper's custom-element attribute map, and exactly ONE custom-element
 * registration. Neither failure mode is visible anywhere else. Both entry points
 * read the compiler's `element` static through an `as unknown as
 * { element: CustomElementConstructor }` cast, which erases the only type-level
 * evidence it exists, so a degraded element type-checks clean; and
 * `scripts/size-check.mjs` fails only on growth, so a bundle that LOST work
 * reads to it as an improvement.
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
 */
const CUSTOM_ELEMENT_ATTRIBUTE = /attribute\s*:\s*['"][a-z-]+['"]/g;

/**
 * One `create_custom_element(Component, props, slots, exports, use_shadow_dom)`
 * call per component compiled as a custom element. The helper's own name is
 * minified away; what survives is the call's `[slots], [exports], true` tail.
 *
 * A shape heuristic, not a parse: it would also match an unrelated call with
 * two array arguments and a trailing boolean. It is only asked to tell 1 from
 * the ~31 that a global `compilerOptions.customElement: true` produces, and it
 * is only consulted once the signal above says the wrapper compiled correctly.
 */
const CREATE_CUSTOM_ELEMENT_CALL =
    /\[[^[\]]*\]\s*,\s*\[[^[\]]*\]\s*,\s*(?:!0|true)\s*\)/g;

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
                `ignore manifest-id, canvas-id, theme and every other attribute.`,
        );
        continue;
    }

    const registrations = code.match(CREATE_CUSTOM_ELEMENT_CALL)?.length ?? 0;
    if (registrations !== 1) {
        problems.push(
            `${name} contains ${registrations} custom-element registration(s); the ` +
                `wrapper's is the only one allowed. A global ` +
                `\`compilerOptions.customElement: true\` puts every component in the ` +
                `graph through custom-element codegen — the element builds must ` +
                `narrow it with \`dynamicCompileOptions\` instead. (A count of 0 ` +
                `instead means CREATE_CUSTOM_ELEMENT_CALL in this script no longer ` +
                `matches the minifier's output.)`,
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
        `${ELEMENT_ARTIFACTS.length} artifact(s) register exactly one custom element.`,
);
