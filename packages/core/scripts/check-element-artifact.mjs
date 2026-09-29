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
 * It then asserts the artifacts touch nothing of the host's they were never
 * asked to: embedding the viewer must have no side effect on the page's
 * storage, so neither artifact may name `document.cookie` — nor `PARAGLIDE`,
 * the localization library whose locale strategy used to write one.
 *
 * It then asserts the artifacts themselves are worth importing: each must carry
 * the element's attribute table (`ELEMENT_PROPS` in
 * `src/lib/components/viewerElement.svelte.ts`). `scripts/size-check.mjs`
 * fails only on growth, so a bundle that LOST work reads to it as an
 * improvement. Svelte's own custom-element wrapper must be absent; whether any
 * component is compiled as a custom element is counted exactly by
 * `noCustomElementGuard` in `src/packaging/elementCompileOptions.ts`.
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
 * An entry of the element's `ELEMENT_PROPS` table. Nothing else in the bundle
 * emits `attribute: '…'`, and the keys and string values here are data the
 * minifier must preserve.
 *
 * This is ALSO the only check here that notices terser property mangling: with
 * `mangle: { properties: true }` in `src/packaging/terserElement.ts`, the
 * artifact keeps `"manifest-id"` as a string and keeps `static get
 * observedAttributes()` — the getter name is in terser's `domprops` reserved
 * list — but every `attribute:` key is renamed away, and this regex drops to
 * zero matches.
 */
const CUSTOM_ELEMENT_ATTRIBUTE = /attribute\s*:\s*['"][a-z-]+['"]/g;

/**
 * The element's `static get observedAttributes()`, which turns the table above
 * into observed attributes. Both minifier shapes keep the spec-defined name.
 */
const OBSERVED_ATTRIBUTES = /static\s+get\s+observedAttributes\s*\(\s*\)/;

/**
 * Reaches for the host page's storage, and remains of the localization library
 * whose locale strategy used to make one.
 *
 * The viewer's page-default locale is read from `<html lang>`; nothing in core
 * persists a locale, or anything else, to `document.cookie`. Terser does not
 * rename a property read off a global it does not control, and it keeps the
 * `PARAGLIDE_*` global names verbatim for the same reason, so the literal text
 * is the whole signal in both cases.
 *
 * A grep of the SOURCE tree would miss either: the artifacts inline every
 * dependency, and both came from one.
 */
const FORBIDDEN_TEXT = [
    {
        pattern: /document\s*\.\s*cookie/,
        problem: (name) =>
            `${name} reads or writes \`document.cookie\`. Embedding the viewer ` +
            `must have no side effect on the host page's storage: the ` +
            `page-default locale comes from \`<html lang>\` and nothing in core ` +
            `persists to cookies. Find the dependency or call site that ` +
            `reintroduced it.`,
    },
    {
        // A sentinel from the German catalog. Core ships English inline and
        // publishes every other catalog as a `triiiceratops/locales/*` asset,
        // so a German string inside an element artifact means a catalog was
        // imported by a shipped module again — which every reader downloads,
        // in every language.
        pattern: /Diese Seite erfordert/,
        problem: (name) =>
            `${name} carries a German chrome string. Only the English catalog ` +
            `(src/lib/messages/en.json) ships inline; the others are published ` +
            `as assets under the \`./locales/*\` subpath and reach a viewer ` +
            `through \`config.messages\`. Find the shipped module that ` +
            `imported one.`,
    },
    {
        pattern: /PARAGLIDE/,
        problem: (name) =>
            `${name} carries a \`PARAGLIDE\` identifier. Core resolves its ` +
            `chrome messages itself (src/lib/state/i18n.svelte.ts) against the ` +
            `catalogs under src/lib/messages; the localization library and its ` +
            `cookie-backed locale strategy are gone and must not return with a ` +
            `dependency.`,
    },
    {
        // Svelte's custom-element base class keeps its props definition on
        // `$$p_d`, and the legacy class component it mounts defines the
        // Svelte 4 `$destroy`. Terser keeps property names verbatim.
        pattern: /\$\$p_d\b|\$destroy\b/,
        problem: (name) =>
            `${name} carries Svelte's custom-element wrapper ` +
            `(\`create_custom_element\` and its legacy \`createClassComponent\`). ` +
            `<triiiceratops-viewer> is the hand-written element in ` +
            `src/lib/components/viewerElement.svelte.ts, mounted with the ` +
            `public \`mount\`; find the component compiled with ` +
            `\`customElement\` or the \`svelte/legacy\` import that brought ` +
            `it back.`,
    },
    ...['hydration_mismatch', 'hydration_failed'].map((code) => ({
        pattern: new RegExp(`svelte\\.dev/e/${code}\\b`),
        problem: (name) =>
            `${name} carries Svelte's SSR-hydration diagnostic \`${code}\`. ` +
            `The element is never server-rendered; ` +
            `src/packaging/svelteRuntimeTrims.ts fixes Svelte's SSR-hydration ` +
            `flag off so those paths tree-shake away. Check that both element ` +
            `configs register \`svelteRuntimeTrims\`, and what in this Svelte ` +
            `release reintroduced a path outside the flag.`,
    })),
    {
        pattern: /\bhash\s*:\s*["'`][\w-]+["'`]\s*,\s*code\s*:/,
        problem: (name) =>
            `${name} carries a per-component \`{ hash, code }\` stylesheet ` +
            `object, so Svelte injects that component's CSS at runtime. The ` +
            `element ships one shadow stylesheet: check that both element ` +
            `configs set \`emitCss: true\` and register \`elementStylesheet\` ` +
            `from src/packaging/elementStylesheet.ts, and that no component is ` +
            `compiled as a custom element.`,
    },
    {
        pattern: /\.svelte-[a-z0-9]+|[" ]svelte-[a-z0-9]+[" ]/,
        problem: (name) =>
            `${name} carries a \`svelte-\` scoping class. Core's element ` +
            `builds scope with the short index hashes from ` +
            `src/packaging/elementStylesheet.ts; check that both element ` +
            `configs pass \`cssHash: elementCssHash(…)\`.`,
    },
    {
        pattern: /svelte\.dev\/e\/async_derived_orphan\b/,
        problem: (name) =>
            `${name} carries Svelte's async-template machinery ` +
            `(\`async_derived_orphan\`). Template effects in the element build ` +
            `are synchronous-only; check that both element configs register ` +
            `\`svelteRuntimeTrims\` from src/packaging/svelteRuntimeTrims.ts.`,
    },
    {
        // Neither path has a diagnostic code. `set_attributes` names each
        // spread handler's slot `'$$' + key`; no other client runtime code
        // builds a string on the `$$` prefix.
        pattern: /["'`]\$\$["'`]\s*\+/,
        problem: (name) =>
            `${name} carries Svelte's attribute-spreading runtime ` +
            `(\`set_attributes\`). The UI primitives and core components ` +
            `declare every attribute they accept; find the \`{...rest}\` or ` +
            `other spread onto an element that brought it back.`,
    },
    {
        // `<svelte:element>`'s block resolves its namespace with
        // `next_tag === 'svg'`; nothing else in the runtime compares a tag
        // name to "svg".
        pattern:
            /["'`]svg["'`]\s*===\s*[\w$]+\s*\?|[\w$]+\s*===\s*["'`]svg["'`]\s*\?/,
        problem: (name) =>
            `${name} carries Svelte's dynamic-element block ` +
            `(\`<svelte:element>\`). Render each tag as its own branch, as ` +
            `AnnotationShapeOverlay and SanitizedHtml do.`,
    },
];

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
 * The risk is not hypothetical. The playground reaches for `<details>/<summary>`
 * and `<optgroup>`, and demo chrome has leaked into the library tree three
 * times. The playground is a separate workspace package under `apps/`, held
 * outside the library by the boundary rule in `eslint.boundaries.js`; this guard
 * covers the components that remain.
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

    for (const { pattern, problem } of FORBIDDEN_TEXT) {
        if (pattern.test(code)) problems.push(problem(name));
    }

    if ((code.match(CUSTOM_ELEMENT_ATTRIBUTE)?.length ?? 0) === 0) {
        problems.push(
            `${name} declares no custom-element attributes: the ` +
                `ELEMENT_PROPS table in src/lib/components/viewerElement.svelte.ts ` +
                `did not reach the bundle. <triiiceratops-viewer> would ignore ` +
                `manifest-id, canvas-id, theme and every other attribute. The ` +
                `other way to get here is terser property ` +
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
                `them. The element in src/lib/components/viewerElement.svelte.ts ` +
                `is not in this bundle, or no longer declares the getter under ` +
                `that name.`,
        );
    }

    // Compiled Svelte templates keep tag names verbatim, so an opening tag in
    // the bundle is a reliable signal the element can reach the shadow root.
    //
    // An opening tag is only ever followed by whitespace, `/` or `>`, and the
    // match is case-sensitive: minified code is full of `h<Hr.length` and
    // `i<table.length`, and a looser pattern reads a terser variable name as an
    // emitted element — a false failure that moves with every rename.
    const emits = (tag) => new RegExp(`<${tag}(?=[\\s/>])`).test(code);
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
        `${ELEMENT_ARTIFACTS.length} artifact(s) carry the element's attribute table ` +
        `and observe it, carry none of the ${FORBIDDEN_TEXT.length} forbidden ` +
        `identifier(s), and emit none of the ` +
        `${markerCount} light-dom-only reset(s)' ${markedRules.length} ` +
        `element-type selector(s).`,
);
