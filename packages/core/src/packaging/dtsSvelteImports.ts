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
 * Deliberately EMPTY. `types/plugin.d.ts` used to be listed here because the
 * Svelte-only `PluginDef` chrome path typed its icons and panels as
 * `Component<any>`; framework-wrappers ticket 12 removed that path, so nothing
 * reachable from `ViewerState` needs Svelte types any more.
 */
export const ALLOWED_SVELTE_IMPORTS_BY_FILE: ReadonlyMap<
    string,
    readonly string[]
> = new Map<string, readonly string[]>([]);

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

export interface DeclarationGraphReport {
    /** Dist-relative entry declarations derived from `package.json#exports`. */
    entryFiles: string[];
    /** Every declaration reached from those entries. */
    visitedFiles: string[];
    violations: SvelteTypeImportViolation[];
    unresolvedImports: UnresolvedDeclarationImport[];
}

/** Collect every `types` condition declared in `package.json#exports`. */
export function collectEntryDeclarations(
    packageJson: unknown,
    packageDir: string,
): string[] {
    const entries = new Set<string>();

    const visit = (node: unknown): void => {
        if (typeof node !== 'object' || node === null) return;
        for (const [key, value] of Object.entries(node)) {
            if (key === 'types' && typeof value === 'string') {
                entries.add(path.resolve(packageDir, value));
            } else {
                visit(value);
            }
        }
    };

    const manifest = (packageJson ?? {}) as Record<string, unknown>;
    visit(manifest.exports);
    if (typeof manifest.types === 'string') {
        entries.add(path.resolve(packageDir, manifest.types));
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

    return {
        entryFiles: entryFiles.map(toDistRelative),
        visitedFiles: [...visited].map(toDistRelative),
        violations,
        unresolvedImports,
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

    console.log(
        `dts-svelte-types: ${report.visitedFiles.length} declaration(s) from ${report.entryFiles.length} entry point(s) need no Svelte types beyond the documented Svelte-consumer surface.`,
    );
}
