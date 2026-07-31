import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
    ALLOWED_SVELTE_IMPORTS_BY_FILE,
    checkDeclarationGraph,
    collectEntryDeclarations,
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

    // The wave-1 guard hole (framework-wrappers ticket 12). A `.svelte.ts` rune
    // module emits `<name>.svelte.d.ts` too, so the old extension-based
    // allowance let it import `svelte` — and `state/viewer.svelte.d.ts` is a
    // rune module reachable from the Svelte-free `./selectors` and framework
    // subpaths. Only a compiled component has its `.svelte` SOURCE copied
    // alongside; a rune module has just the emitted `.js`.
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

    // Framework-wrappers ticket 12 removed the last per-file exception (the
    // Svelte-only `PluginDef` chrome path in `types/plugin.d.ts`). A plain
    // declaration importing `svelte` is a violation wherever it lives.
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

describe('entry declaration discovery', () => {
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
