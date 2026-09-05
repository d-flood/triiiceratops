import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
    ALLOWED_SVELTE_IMPORTS_BY_FILE,
    SVELTE_CONSUMER_SUBPATHS,
    checkDeclarationGraph,
    collectEntryDeclarations,
    collectEntryDeclarationsBySubpath,
    formatDeclarationGraphProblems,
} from './dtsSvelteImports';

/*
 * The declaration-graph guard that keeps Svelte out of core's published TYPE
 * surface, so a React or Vue consumer can type-check `triiiceratops` with no
 * `svelte` package installed.
 *
 * Driven against synthetic package directories rather than the real `dist/`:
 * these tests must run without a prior `build:lib`, and the interesting cases
 * (a planted Svelte type import, an unreachable one, one hidden in a comment)
 * are exactly the ones a real build refuses to produce. The real `dist/` is
 * checked by `build:lib` itself.
 */

let packageDir: string;

function writePackage(
    exportsField: Record<string, unknown>,
    declarations: Record<string, string>,
): void {
    writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: 'triiiceratops', exports: exportsField }),
    );

    for (const [distRelativePath, source] of Object.entries(declarations)) {
        const filePath = join(packageDir, 'dist', distRelativePath);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, source);
    }
}

const singleEntry = { '.': { types: './dist/index.d.ts' } };

beforeEach(() => {
    packageDir = mkdtempSync(join(tmpdir(), 'triiiceratops-dts-'));
});

afterEach(() => {
    rmSync(packageDir, { recursive: true, force: true });
});

describe('published declaration graph', () => {
    it('accepts a graph that needs no Svelte types', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export type { ViewerState } from './state/viewer.svelte.js';\n",
            'state/viewer.svelte.d.ts':
                'export declare class ViewerState {\n' +
                '    visibleAnnotationIds: Set<string>;\n' +
                '    selectedChoices: Map<string, string>;\n' +
                '}\n',
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.violations).toEqual([]);
        expect(report.unresolvedImports).toEqual([]);
        expect(formatDeclarationGraphProblems(report)).toBeNull();
    });

    // The regression this whole guard exists for: re-annotating one of the four
    // reactive-collection members with `SvelteSet`/`SvelteMap` puts
    // `svelte/reactivity` back into the published declarations.
    it('fails on a planted svelte/reactivity import and names the chain', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export type { ViewerState } from './state/viewer.svelte.js';\n",
            'state/viewer.svelte.d.ts':
                "import { SvelteSet } from 'svelte/reactivity';\n" +
                'export declare class ViewerState {\n' +
                '    visibleAnnotationIds: SvelteSet<string>;\n' +
                '}\n',
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.violations).toEqual([
            {
                chain: ['index.d.ts', 'state/viewer.svelte.d.ts'],
                specifier: 'svelte/reactivity',
            },
        ]);
        expect(formatDeclarationGraphProblems(report)).toContain(
            'index.d.ts -> state/viewer.svelte.d.ts imports svelte/reactivity',
        );
    });

    it('fails on svelte/reactivity even inside a compiled component declaration', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';\n",
            // svelte-package copies the component SOURCE next to its
            // declaration; that sibling is what marks this a compiled component.
            'components/TriiiceratopsViewer.svelte': '<script></script>\n',
            'components/TriiiceratopsViewer.svelte.d.ts':
                "import type { SvelteSet } from 'svelte/reactivity';\n" +
                'declare const TriiiceratopsViewer: import("svelte").Component<{ ids: SvelteSet<string> }>;\n' +
                'export default TriiiceratopsViewer;\n',
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.violations).toEqual([
            {
                chain: [
                    'index.d.ts',
                    'components/TriiiceratopsViewer.svelte.d.ts',
                ],
                specifier: 'svelte/reactivity',
            },
        ]);
    });

    // A compiled Svelte component's own type is a Svelte type, and it is
    // reachable only from the `.` entry, whose `svelte` export condition already
    // targets consumers that installed the optional peer.
    it('allows a compiled component declaration to use Svelte component types', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';\n",
            'components/TriiiceratopsViewer.svelte': '<script></script>\n',
            'components/TriiiceratopsViewer.svelte.d.ts':
                "import type { ClassValue } from 'svelte/elements';\n" +
                'declare const TriiiceratopsViewer: import("svelte").Component<{ class: ClassValue }>;\n' +
                'export default TriiiceratopsViewer;\n',
        });

        expect(checkDeclarationGraph(packageDir).violations).toEqual([]);
    });

    // A `.svelte.ts` rune module emits `<name>.svelte.d.ts` too, so an
    // extension-based allowance would let it import `svelte` — and
    // `state/viewer.svelte.d.ts` is a rune module reachable from the
    // Svelte-free `./selectors` and framework subpaths. Only a compiled
    // component has its `.svelte` SOURCE copied alongside; a rune module has
    // just the emitted `.js`.
    it('fails on a svelte type import in a .svelte.ts rune module declaration', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export type { ViewerState } from './state/viewer.svelte.js';\n",
            'state/viewer.svelte.js': 'export class ViewerState {}\n',
            'state/viewer.svelte.d.ts':
                "import type { Component } from 'svelte';\n" +
                'export declare class ViewerState {\n' +
                '    chrome: Component<any>[];\n' +
                '}\n',
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.violations).toEqual([
            {
                chain: ['index.d.ts', 'state/viewer.svelte.d.ts'],
                specifier: 'svelte',
            },
        ]);
    });

    // No per-file exceptions: a plain declaration importing `svelte` is a
    // violation wherever it lives.
    it('has no per-file Svelte import exceptions', () => {
        expect([...ALLOWED_SVELTE_IMPORTS_BY_FILE.keys()]).toEqual([]);
    });

    it('fails on a svelte type import from any plain declaration', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export type { PluginPanel } from './types/plugin.js';\n" +
                "export type { ThemeConfig } from './theme/types.js';\n",
            'types/plugin.d.ts':
                "import type { Component } from 'svelte';\n" +
                'export interface PluginPanel { icon?: Component }\n',
            'theme/types.d.ts':
                "import type { Component } from 'svelte';\n" +
                'export interface ThemeConfig { icon?: Component }\n',
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.violations).toEqual([
            {
                chain: ['index.d.ts', 'types/plugin.d.ts'],
                specifier: 'svelte',
            },
            {
                chain: ['index.d.ts', 'theme/types.d.ts'],
                specifier: 'svelte',
            },
        ]);
    });

    it('ignores Svelte specifiers that appear only in comments', () => {
        writePackage(singleEntry, {
            'index.d.ts':
                "export type { ThemeConfig } from './theme/types.js';\n",
            'theme/types.d.ts':
                '/**\n' +
                " * Example: import { MediaQuery } from 'svelte/reactivity';\n" +
                ' */\n' +
                'export interface ThemeConfig { name: string }\n',
        });

        expect(checkDeclarationGraph(packageDir).violations).toEqual([]);
    });

    it('ignores declarations no entry point reaches', () => {
        writePackage(singleEntry, {
            'index.d.ts': 'export interface Nothing {}\n',
            'components/Orphan.svelte.d.ts':
                "import { SvelteMap } from 'svelte/reactivity';\n" +
                'export declare const orphan: SvelteMap<string, string>;\n',
        });

        expect(checkDeclarationGraph(packageDir).violations).toEqual([]);
    });

    it('reports a relative import it cannot resolve, so the walk is never silently short', () => {
        writePackage(singleEntry, {
            'index.d.ts': "export type { Gone } from './state/gone.js';\n",
        });

        const report = checkDeclarationGraph(packageDir);

        expect(report.unresolvedImports).toEqual([
            { file: 'index.d.ts', specifier: './state/gone.js' },
        ]);
        expect(formatDeclarationGraphProblems(report)).toContain(
            'index.d.ts imports ./state/gone.js',
        );
    });

    it('throws when a declared entry point has not been built', () => {
        writePackage(singleEntry, {});

        expect(() => checkDeclarationGraph(packageDir)).toThrow(
            /types.*entry points are missing from dist/s,
        );
    });

    it('walks every subpath, including framework subpaths added later', () => {
        writePackage(
            {
                '.': { types: './dist/index.d.ts' },
                './testing': { types: './dist/testing/index.d.ts' },
                './react': { types: './dist/react/index.d.ts' },
                './style.css': './dist/triiiceratops.css',
            },
            {
                'index.d.ts': 'export interface Core {}\n',
                'testing/index.d.ts': 'export interface Kit {}\n',
                'react/index.d.ts':
                    "import type { SvelteSet } from 'svelte/reactivity';\n" +
                    'export declare const ids: SvelteSet<string>;\n',
            },
        );

        const report = checkDeclarationGraph(packageDir);

        expect(report.entryFiles.sort()).toEqual([
            'index.d.ts',
            'react/index.d.ts',
            'testing/index.d.ts',
        ]);
        expect(report.violations).toEqual([
            { chain: ['react/index.d.ts'], specifier: 'svelte/reactivity' },
        ]);
    });
});

/*
 * The no-Svelte promise is PER ENTRY POINT.
 * `triiiceratops` as a whole cannot be Svelte-free — `.` is the Svelte-consumer
 * entry and deliberately exports the compiled component — so the criterion is
 * enforced against each subpath's own declaration graph instead.
 */
describe('strictly Svelte-free subpaths', () => {
    const frameworkExports = {
        '.': { types: './dist/index.d.ts' },
        './svelte': { types: './dist/svelte.d.ts', svelte: './dist/svelte.js' },
        './react': { types: './dist/react.d.ts' },
        './vue': { types: './dist/vue.d.ts' },
    };

    // A compiled component's declaration IS allowed to import `svelte` — but
    // only where `./svelte` reaches it. The whole-package pass alone cannot see
    // this leak, because its allowance is keyed by FILE rather than by entry
    // point.
    //
    // `.` is deliberately included among the violators here: if a future edit
    // re-exports the component from `.`, this fails.
    it('rejects a component declaration reached from `.` or a framework subpath while allowing it from `./svelte`', () => {
        writePackage(frameworkExports, {
            'svelte.d.ts':
                "export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';\n",
            'components/TriiiceratopsViewer.svelte': '<script></script>\n',
            'components/TriiiceratopsViewer.svelte.d.ts':
                'declare const TriiiceratopsViewer: import("svelte").Component<{ id: string }>;\n' +
                'export default TriiiceratopsViewer;\n',
            'index.d.ts':
                "export { default as Viewer } from './components/TriiiceratopsViewer.svelte';\n",
            'react.d.ts':
                "export { default as Viewer } from './components/TriiiceratopsViewer.svelte';\n",
            'vue.d.ts': 'export interface VueWrapper {}\n',
        });

        const report = checkDeclarationGraph(packageDir);

        // The whole-package pass is satisfied: the file is a compiled component.
        expect(report.violations).toEqual([]);
        expect(
            report.svelteFreeViolations.map((v) => v.subpath).sort(),
        ).toEqual(['.', './react']);
        expect(report.svelteFreeViolations).toContainEqual({
            subpath: './react',
            chain: ['react.d.ts', 'components/TriiiceratopsViewer.svelte.d.ts'],
            specifier: 'svelte',
        });
        expect(formatDeclarationGraphProblems(report)).toContain(
            './react: react.d.ts -> components/TriiiceratopsViewer.svelte.d.ts imports svelte',
        );
    });

    it('reports the subpath that reaches a shared declaration, once per subpath', () => {
        writePackage(frameworkExports, {
            'index.d.ts':
                "export type { Props } from './framework/props.js';\n",
            'framework/props.d.ts':
                "import type { Component } from 'svelte';\n" +
                'export interface Props { icon: Component }\n',
            'svelte.d.ts':
                "export type { Props } from './framework/props.js';\n",
            'react.d.ts':
                "export type { Props } from './framework/props.js';\n",
            'vue.d.ts': "export type { Props } from './framework/props.js';\n",
        });

        const report = checkDeclarationGraph(packageDir);

        expect(
            report.svelteFreeViolations.map((v) => v.subpath).sort(),
        ).toEqual(['.', './react', './vue']);
    });

    it('lists every non-`./svelte` subpath as strict, so a subpath added later is covered by default', () => {
        writePackage(
            {
                '.': { types: './dist/index.d.ts' },
                './svelte': { types: './dist/svelte.d.ts' },
                './react': { types: './dist/react.d.ts' },
                './solid': { types: './dist/solid.d.ts' },
            },
            {
                'index.d.ts': 'export interface Core {}\n',
                'svelte.d.ts': 'export interface S5 {}\n',
                'react.d.ts': 'export interface R {}\n',
                'solid.d.ts': 'export interface S {}\n',
            },
        );

        const report = checkDeclarationGraph(packageDir);

        // `.` is strict now, and `./solid` — a subpath this guard has never heard
        // of — is strict without anyone adding it anywhere.
        expect(report.svelteFreeEntries).toEqual([
            { subpath: '.', declaration: 'index.d.ts' },
            { subpath: './react', declaration: 'react.d.ts' },
            { subpath: './solid', declaration: 'solid.d.ts' },
        ]);
        expect(report.svelteFreeViolations).toEqual([]);
    });

    it('exempts only the `./svelte` entry', () => {
        expect([...SVELTE_CONSUMER_SUBPATHS]).toEqual(['./svelte']);
    });

    it('holds the `.` entry to the strict rule', () => {
        // The whole point of the `./svelte` split: `.` is framework-neutral now,
        // so a Svelte type reachable from it is a violation, not an allowance.
        expect(SVELTE_CONSUMER_SUBPATHS.has('.')).toBe(false);
    });
});

describe('entry declaration discovery', () => {
    it('maps each subpath to its own types target', () => {
        const bySubpath = collectEntryDeclarationsBySubpath(
            {
                types: './dist/index.d.ts',
                exports: {
                    '.': {
                        types: './dist/index.d.ts',
                        import: './dist/index.js',
                    },
                    './react': { types: './dist/react.d.ts' },
                    './element': './dist/triiiceratops-element.iife.js',
                },
            },
            '/pkg',
        );

        expect([...bySubpath.keys()].sort()).toEqual(['.', './react']);
        expect(bySubpath.get('./react')).toEqual([
            resolve('/pkg', 'dist/react.d.ts'),
        ]);
    });

    it('treats a condition-map `exports` with no subpaths as the `.` entry', () => {
        const bySubpath = collectEntryDeclarationsBySubpath(
            { exports: { types: './dist/index.d.ts' } },
            '/pkg',
        );

        expect([...bySubpath.keys()]).toEqual(['.']);
    });

    it('collects every types condition and the legacy top-level types field', () => {
        const entries = collectEntryDeclarations(
            {
                types: './dist/index.d.ts',
                exports: {
                    '.': {
                        types: './dist/index.d.ts',
                        import: './dist/index.js',
                    },
                    './vue': { types: './dist/vue/index.d.ts' },
                    './element': './dist/triiiceratops-element.iife.js',
                },
            },
            '/pkg',
        );

        expect(entries.sort()).toEqual([
            resolve('/pkg', 'dist/index.d.ts'),
            resolve('/pkg', 'dist/vue/index.d.ts'),
        ]);
    });
});
