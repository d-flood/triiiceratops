import { describe, it, expect } from 'vitest';
import { isPackageExcluded, DEMO_ONLY_COMPONENTS } from './pruneDist';

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
