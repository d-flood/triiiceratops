/*
 * Guard: Svelte must not be a TYPE-TIME requirement for a `triiiceratops`
 * consumer (build-time tooling — lives in src/packaging, never published).
 *
 * A React or Vue application installs `triiiceratops` without the optional
 * `svelte` peer dependency. If a `.d.ts` reachable from a published entry point
 * imports a `svelte*` specifier, that application's type-check fails outright
 * (or silently degrades under `skipLibCheck`), which contradicts the framework
 * wrapper promise that Svelte stays behind the custom-element boundary.
 *
 * This walks the declaration graph from every `types` condition in
 * `package.json#exports` — so the framework subpaths are covered the moment they
 * are added — and reports every disallowed Svelte type import with the entry-to-
 * file chain that reaches it. Comments are not scanned: the graph is parsed with
 * the TypeScript AST, so prose mentioning `svelte/reactivity` is not a finding.
 *
 * TWO checks run over that graph, because the promise is PER ENTRY POINT:
 *
 *   1. A whole-package check with the documented allowances below. A compiled
 *      Svelte component's declaration IS a Svelte type, and `.` deliberately
 *      exports one, so it is allowed there.
 *   2. A strict per-entry check over every subpath EXCEPT `.` (see
 *      `SVELTE_CONSUMER_SUBPATHS`). Those graphs are walked independently, with
 *      no allowance at all: `triiiceratops/react`, `triiiceratops/vue`,
 *      `triiiceratops/selectors`, and `triiiceratops/testing` must reach zero
 *      `svelte*` specifiers. Check 1 cannot express this — its
 *      compiled-component allowance is keyed by FILE, so it would happily let
 *      `./react` re-export something that reaches
 *      `components/TriiiceratopsViewer.svelte.d.ts`, a leak check 2 exists to
 *      close.
 *
 * Run directly: `node ./src/packaging/dtsSvelteImports.ts` (Node strips the
 * types), which is how `build:lib` invokes it after `svelte-package` emits
 * `dist/**\/*.d.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Any specifier a consumer could only resolve with Svelte installed. */
const SVELTE_SPECIFIER_RE = /^(svelte(\/|$)|@sveltejs\/)/;

/**
 * Never allowed in a published declaration, in any file. `ViewerState`'s four
 * reactive-collection members are declared as the plain built-ins that
 * `SvelteSet`/`SvelteMap` extend precisely so this stays true; the invariant
 * that they HOLD reactive collections lives in the state inventory
 * (`REACTIVE_COLLECTION_MEMBERS`) rather than in the type system.
 */
const NEVER_ALLOWED_SPECIFIERS: readonly string[] = ['svelte/reactivity'];

/**
 * A compiled Svelte component declaration IS a Svelte type
 * (`import("svelte").Component<Props>`), and it is reachable only from the `.`
 * entry — whose `svelte` export condition already targets Svelte consumers that
 * installed the optional peer.
 */
const ALLOWED_IN_COMPONENT_DECLARATIONS: readonly string[] = [
    'svelte',
    'svelte/elements',
];

/**
 * Per-file exceptions, keyed by dist-relative POSIX path. Each is a documented
 * scope decision, not a suppression: add one only when the Svelte type is
 * unreachable from the framework wrappers' supported surface.
 *
 * Deliberately EMPTY: nothing reachable from `ViewerState` needs Svelte types.
 */
export const ALLOWED_SVELTE_IMPORTS_BY_FILE: ReadonlyMap<
    string,
    readonly string[]
> = new Map<string, readonly string[]>([]);

/**
 * Export subpaths that may reach a Svelte type at all — everything else is held
 * to the strict per-entry rule.
 *
 * `./svelte` IS the Svelte-consumer entry: `package.json` maps the `svelte`
 * export condition to it and it deliberately exports the compiled
 * `TriiiceratopsViewer` component, whose declaration is
 * `import("svelte").Component<…>`.
 *
 * `.` must NOT export the compiled component, because TypeScript resolves the
 * single `types` condition regardless of the `svelte` condition: if the
 * component hung off `.`, a Svelte-free consumer type-checking
 * `import type { ViewerState } from 'triiiceratops'` under
 * `skipLibCheck: false` would get an error from a file it never asked for —
 * and `@triiiceratops/plugin-sdk`'s react/vue entries import that very type
 * from this entry, so the breakage would reach framework consumers
 * transitively. Keeping the component under `./svelte` keeps `.`
 * framework-neutral.
 *
 * Every OTHER subpath — the framework wrappers and `.` included — must be
 * strictly Svelte-free, and a subpath added later is strict by default.
 */
export const SVELTE_CONSUMER_SUBPATHS: ReadonlySet<string> = new Set([
    './svelte',
]);

/** A disallowed Svelte type import, with the entry-to-file chain reaching it. */
export interface SvelteTypeImportViolation {
    /** Dist-relative paths from the entry declaration to the offending file. */
    chain: string[];
    specifier: string;
}

/** A relative import the walk could not resolve, so the graph is incomplete. */
export interface UnresolvedDeclarationImport {
    file: string;
    specifier: string;
}

/**
 * A Svelte type import reached from a subpath that promises to need none. Unlike
 * `SvelteTypeImportViolation` this carries the offending SUBPATH, because the
 * same declaration is legitimate when `.` reaches it and a broken promise when
 * `./react` does.
 */
export interface SvelteFreeEntryViolation {
    /** The `package.json#exports` key whose graph reached the import. */
    subpath: string;
    /** Dist-relative paths from that subpath's declaration to the offender. */
    chain: string[];
    specifier: string;
}

export interface DeclarationGraphReport {
    /** Dist-relative entry declarations derived from `package.json#exports`. */
    entryFiles: string[];
    /** Every declaration reached from those entries. */
    visitedFiles: string[];
    violations: SvelteTypeImportViolation[];
    unresolvedImports: UnresolvedDeclarationImport[];
    /** Subpaths held to the strict rule, with their dist-relative declaration. */
    svelteFreeEntries: Array<{ subpath: string; declaration: string }>;
    /** Every `svelte*` specifier any of those subpaths reaches. */
    svelteFreeViolations: SvelteFreeEntryViolation[];
}

/** Every `types` condition anywhere below one `exports` node. */
function collectTypesTargets(
    node: unknown,
    packageDir: string,
    into: Set<string>,
): void {
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
        if (key === 'types' && typeof value === 'string') {
            into.add(path.resolve(packageDir, value));
        } else {
            collectTypesTargets(value, packageDir, into);
        }
    }
}

/**
 * Map each export SUBPATH to the declaration(s) its `types` condition names.
 *
 * A condition-map `exports` with no subpaths (`{ types, import }`) describes the
 * `.` subpath, and the legacy top-level `types` field does too.
 */
export function collectEntryDeclarationsBySubpath(
    packageJson: unknown,
    packageDir: string,
): Map<string, string[]> {
    const manifest = (packageJson ?? {}) as Record<string, unknown>;
    const bySubpath = new Map<string, Set<string>>();

    const add = (subpath: string, targets: Set<string>): void => {
        if (targets.size === 0) return;
        const existing = bySubpath.get(subpath) ?? new Set<string>();
        for (const target of targets) existing.add(target);
        bySubpath.set(subpath, existing);
    };

    const exportsField = manifest.exports;
    if (typeof exportsField === 'object' && exportsField !== null) {
        for (const [key, value] of Object.entries(exportsField)) {
            const targets = new Set<string>();
            if (key.startsWith('.')) {
                collectTypesTargets(value, packageDir, targets);
                add(key, targets);
            } else {
                // A bare condition key at the top level belongs to `.`.
                collectTypesTargets({ [key]: value }, packageDir, targets);
                add('.', targets);
            }
        }
    }

    if (typeof manifest.types === 'string') {
        add('.', new Set([path.resolve(packageDir, manifest.types)]));
    }

    return new Map([...bySubpath].map(([key, set]) => [key, [...set]]));
}

/** Collect every `types` condition declared in `package.json#exports`. */
export function collectEntryDeclarations(
    packageJson: unknown,
    packageDir: string,
): string[] {
    const entries = new Set<string>();
    for (const targets of collectEntryDeclarationsBySubpath(
        packageJson,
        packageDir,
    ).values()) {
        for (const target of targets) entries.add(target);
    }
    return [...entries];
}

/** Resolve a relative specifier as written in an emitted declaration file. */
function resolveDeclaration(
    fromFile: string,
    specifier: string,
): string | null {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates: string[] = [];

    if (specifier.endsWith('.js')) {
        candidates.push(base.replace(/\.js$/, '.d.ts'));
    } else if (specifier.endsWith('.svelte')) {
        // svelte-package emits `Foo.svelte` -> `Foo.svelte.d.ts`.
        candidates.push(`${base}.d.ts`);
    } else if (specifier.endsWith('.d.ts')) {
        candidates.push(base);
    }

    candidates.push(`${base}.d.ts`, path.join(base, 'index.d.ts'));

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Every module specifier in a declaration file. Comments are excluded. */
function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
    const specifiers: string[] = [];

    const visit = (node: ts.Node): void => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        } else if (
            ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            ts.isStringLiteral(node.moduleReference.expression)
        ) {
            specifiers.push(node.moduleReference.expression.text);
        } else if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        ) {
            // `import("svelte").Component<Props>` — how svelte-package types a
            // compiled component's default export.
            specifiers.push(node.argument.literal.text);
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // `/// <reference types="svelte" />` is a type dependency too.
    for (const directive of sourceFile.typeReferenceDirectives) {
        specifiers.push(directive.fileName);
    }

    return specifiers;
}

/**
 * Is this declaration the output of COMPILING a `*.svelte` component, as opposed
 * to a `*.svelte.ts` rune module?
 *
 * Both emit `<name>.svelte.d.ts`, so the extension alone cannot tell them apart
 * — and that mattered: `state/viewer.svelte.d.ts` is a rune module reachable
 * from the Svelte-free `./selectors` and framework subpaths, and an
 * extension-based allowance let a `svelte` type import slip through it.
 *
 * The originating source file is what distinguishes them, and `svelte-package`
 * puts it in dist: a compiled component's `.svelte` SOURCE is copied next to its
 * declaration (for the `.` entry's Svelte consumers), while a rune module emits
 * only `<name>.svelte.js`. So the sibling `<name>.svelte` file existing means —
 * and only means — the declaration came from a `*.svelte` component.
 */
function isCompiledSvelteComponentDeclaration(filePath: string): boolean {
    if (!filePath.endsWith('.svelte.d.ts')) return false;
    return existsSync(filePath.slice(0, -'.d.ts'.length));
}

function isAllowedSvelteImport(
    filePath: string,
    distRelativePath: string,
    specifier: string,
): boolean {
    if (NEVER_ALLOWED_SPECIFIERS.includes(specifier)) return false;

    if (
        isCompiledSvelteComponentDeclaration(filePath) &&
        ALLOWED_IN_COMPONENT_DECLARATIONS.includes(specifier)
    ) {
        return true;
    }

    return (
        ALLOWED_SVELTE_IMPORTS_BY_FILE.get(distRelativePath)?.includes(
            specifier,
        ) ?? false
    );
}

/**
 * Walk the declaration graph of a built package directory. Throws only if the
 * declared entry points are missing (i.e. the package was not built).
 */
export function checkDeclarationGraph(
    packageDir: string,
): DeclarationGraphReport {
    const distDir = path.join(packageDir, 'dist');
    const packageJson: unknown = JSON.parse(
        readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
    const entryFiles = collectEntryDeclarations(packageJson, packageDir);
    const missing = entryFiles.filter((entry) => !existsSync(entry));

    if (missing.length > 0) {
        throw new Error(
            `Declared \`types\` entry points are missing from dist — run \`pnpm build:lib\` first:\n${missing
                .map((entry) => `- ${path.relative(packageDir, entry)}`)
                .join('\n')}`,
        );
    }

    const toDistRelative = (filePath: string) =>
        path.relative(distDir, filePath).split(path.sep).join('/');

    const visited = new Set<string>();
    const violations: SvelteTypeImportViolation[] = [];
    const unresolvedImports: UnresolvedDeclarationImport[] = [];

    const visit = (filePath: string, chain: string[]): void => {
        if (visited.has(filePath)) return;
        visited.add(filePath);

        const distRelativePath = toDistRelative(filePath);
        const sourceFile = ts.createSourceFile(
            filePath,
            readFileSync(filePath, 'utf8'),
            ts.ScriptTarget.Latest,
            /* setParentNodes */ false,
            ts.ScriptKind.TS,
        );

        for (const specifier of collectModuleSpecifiers(sourceFile)) {
            if (SVELTE_SPECIFIER_RE.test(specifier)) {
                if (
                    !isAllowedSvelteImport(
                        filePath,
                        distRelativePath,
                        specifier,
                    )
                ) {
                    violations.push({
                        chain: [...chain, distRelativePath],
                        specifier,
                    });
                }
                continue;
            }

            if (!specifier.startsWith('.')) continue;

            const resolved = resolveDeclaration(filePath, specifier);

            if (resolved === null) {
                unresolvedImports.push({
                    file: distRelativePath,
                    specifier,
                });
                continue;
            }

            visit(resolved, [...chain, distRelativePath]);
        }
    };

    for (const entry of entryFiles) {
        visit(entry, []);
    }

    // Strict per-entry pass. Each subpath gets its OWN visited set: a file the
    // `.` entry already walked must still be walked (and judged) for `./react`,
    // because what matters is which entry point can REACH the Svelte type.
    const svelteFreeEntries: Array<{ subpath: string; declaration: string }> =
        [];
    const svelteFreeViolations: SvelteFreeEntryViolation[] = [];

    for (const [subpath, declarations] of collectEntryDeclarationsBySubpath(
        packageJson,
        packageDir,
    )) {
        if (SVELTE_CONSUMER_SUBPATHS.has(subpath)) continue;

        for (const declaration of declarations) {
            svelteFreeEntries.push({
                subpath,
                declaration: toDistRelative(declaration),
            });

            const seen = new Set<string>();
            const walk = (filePath: string, chain: string[]): void => {
                if (seen.has(filePath)) return;
                seen.add(filePath);

                const distRelativePath = toDistRelative(filePath);
                const sourceFile = ts.createSourceFile(
                    filePath,
                    readFileSync(filePath, 'utf8'),
                    ts.ScriptTarget.Latest,
                    /* setParentNodes */ false,
                    ts.ScriptKind.TS,
                );

                for (const specifier of collectModuleSpecifiers(sourceFile)) {
                    if (SVELTE_SPECIFIER_RE.test(specifier)) {
                        svelteFreeViolations.push({
                            subpath,
                            chain: [...chain, distRelativePath],
                            specifier,
                        });
                        continue;
                    }
                    if (!specifier.startsWith('.')) continue;
                    const resolved = resolveDeclaration(filePath, specifier);
                    // A missing relative target is already reported by the
                    // whole-package pass as an unresolved import.
                    if (resolved === null) continue;
                    walk(resolved, [...chain, distRelativePath]);
                }
            };

            walk(declaration, []);
        }
    }

    return {
        entryFiles: entryFiles.map(toDistRelative),
        visitedFiles: [...visited].map(toDistRelative),
        violations,
        unresolvedImports,
        svelteFreeEntries,
        svelteFreeViolations,
    };
}

/** Build-failure message for a report, or `null` when the graph is clean. */
export function formatDeclarationGraphProblems(
    report: DeclarationGraphReport,
): string | null {
    const problems: string[] = [];

    if (report.violations.length > 0) {
        problems.push(
            `Published declarations reach a Svelte type import, so a consumer without the optional \`svelte\` peer cannot type-check:\n${report.violations
                .map(
                    ({ chain, specifier }) =>
                        `- ${chain.join(' -> ')} imports ${specifier}`,
                )
                .join('\n')}`,
        );
    }

    if (report.svelteFreeViolations.length > 0) {
        problems.push(
            `These export subpaths promise a consumer needs no \`svelte\` package to type-check them, but their declaration graphs reach one:\n${report.svelteFreeViolations
                .map(
                    ({ subpath, chain, specifier }) =>
                        `- ${subpath}: ${chain.join(' -> ')} imports ${specifier}`,
                )
                .join(
                    '\n',
                )}\nOnly ${[...SVELTE_CONSUMER_SUBPATHS].join(', ')} may reach a Svelte type. Re-export from the framework substrate, \`./selectors\`, or \`types/*\` — never from the \`.\` entry's component surface.`,
        );
    }

    if (report.unresolvedImports.length > 0) {
        problems.push(
            `Published declarations import relative modules that are not in dist, so the Svelte type walk is incomplete:\n${report.unresolvedImports
                .map(({ file, specifier }) => `- ${file} imports ${specifier}`)
                .join('\n')}`,
        );
    }

    return problems.length > 0 ? problems.join('\n\n') : null;
}

// CLI entry: check ./dist relative to the package root (this file is src/packaging/).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const packageDir = fileURLToPath(new URL('../..', import.meta.url));
    const report = checkDeclarationGraph(packageDir);
    const problems = formatDeclarationGraphProblems(report);

    if (problems !== null) {
        throw new Error(problems);
    }

    const strict = report.svelteFreeEntries
        .map(({ subpath }) => subpath)
        .join(', ');
    console.log(
        `dts-svelte-types: ${report.visitedFiles.length} declaration(s) from ${report.entryFiles.length} entry point(s) need no Svelte types beyond the documented Svelte-consumer surface. Strictly Svelte-free subpaths: ${strict || 'none'}.`,
    );
}
