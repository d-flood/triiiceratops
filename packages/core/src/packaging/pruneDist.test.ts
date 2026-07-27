import { describe, it, expect } from 'vitest';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    isPackageExcluded,
    pruneDist,
    DEMO_ONLY_COMPONENTS,
    EXCLUDED_DIRS,
} from './pruneDist';

describe('isPackageExcluded', () => {
    it('excludes compiled test/spec files', () => {
        for (const f of [
            'colorUtils.test.js',
            'colorUtils.test.d.ts',
            'AnnotationManager.test.js',
            'sanitizeHtml.spec.js',
            'foo.test.ts',
        ]) {
            expect(f, `${f} should be excluded`).toSatisfy(isPackageExcluded);
        }
    });

    it('excludes demo-only components (.svelte and .svelte.d.ts)', () => {
        for (const c of DEMO_ONLY_COMPONENTS) {
            expect(isPackageExcluded(`${c}.svelte`)).toBe(true);
            expect(isPackageExcluded(`${c}.svelte.d.ts`)).toBe(true);
        }
    });

    it('keeps public API components and modules', () => {
        for (const f of [
            'TriiiceratopsViewer.svelte',
            'TriiiceratopsViewer.svelte.d.ts',
            'index.js',
            'index.d.ts',
            'colorUtils.js',
            'AnnotationOverlay.svelte',
            'ThemeToggle.svelte',
            // not a test file just because "test" appears mid-word
            'contestants.js',
        ]) {
            expect(f, `${f} should be kept`).not.toSatisfy(isPackageExcluded);
        }
    });
});

describe('pruneDist', () => {
    it('removes excluded dirs and test/demo files, keeps public modules', () => {
        const dir = mkdtempSync(join(tmpdir(), 'prune-'));
        try {
            // Internal test fixtures/mocks dir (must be dropped wholesale).
            mkdirSync(join(dir, 'test', 'fixtures'), { recursive: true });
            writeFileSync(join(dir, 'test', 'fixtures', 'manifests.js'), '');
            writeFileSync(join(dir, 'test', 'utils.js'), '');
            // A compiled test file and a demo-only component (basename matches).
            writeFileSync(join(dir, 'colorUtils.test.js'), '');
            writeFileSync(join(dir, 'MetadataPanelTestHost.svelte'), '');
            // Public modules that must survive.
            writeFileSync(join(dir, 'index.js'), '');
            mkdirSync(join(dir, 'components'), { recursive: true });
            writeFileSync(
                join(dir, 'components', 'TriiiceratopsViewer.svelte'),
                '',
            );

            const removed = pruneDist(dir);

            for (const d of EXCLUDED_DIRS) {
                expect(existsSync(join(dir, d)), `${d}/ removed`).toBe(false);
            }
            expect(existsSync(join(dir, 'colorUtils.test.js'))).toBe(false);
            expect(existsSync(join(dir, 'MetadataPanelTestHost.svelte'))).toBe(
                false,
            );
            expect(existsSync(join(dir, 'index.js'))).toBe(true);
            expect(
                existsSync(
                    join(dir, 'components', 'TriiiceratopsViewer.svelte'),
                ),
            ).toBe(true);
            expect(removed.length).toBeGreaterThan(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
