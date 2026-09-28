/** Asserts what consumers rely on, never a viewer's coverage number. */

import { describe, expect, it } from 'vitest';

import { COMPETITORS, COOKBOOK_MATRIX } from './index';

const MARKS = new Set(['yes', 'partial', 'no']);

describe('the Cookbook matrix reading', () => {
    it('records when and what it read', () => {
        expect(COOKBOOK_MATRIX.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(COOKBOOK_MATRIX.source).toMatch(
            /^https:\/\/iiif\.io\/api\/cookbook\/recipe\/matrix\/$/,
        );
    });

    it('gives every recipe a mark for every viewer', () => {
        expect(COOKBOOK_MATRIX.viewers.length).toBeGreaterThan(0);
        expect(COOKBOOK_MATRIX.recipes.length).toBeGreaterThan(0);
        for (const recipe of COOKBOOK_MATRIX.recipes) {
            const marked = Object.keys(recipe.marks);
            expect(marked.sort(), recipe.id).toEqual(
                [...COOKBOOK_MATRIX.viewers].sort(),
            );
            for (const viewer of COOKBOOK_MATRIX.viewers) {
                expect(
                    MARKS.has(recipe.marks[viewer]),
                    `${recipe.id}/${viewer}`,
                ).toBe(true);
            }
        }
    });

    it('lists each recipe once, by slug', () => {
        const ids = COOKBOOK_MATRIX.recipes.map((recipe) => recipe.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('carries a column for every viewer a competitor joins to', () => {
        for (const { id, matrixColumn } of COMPETITORS) {
            if (matrixColumn === undefined) continue;
            expect(COOKBOOK_MATRIX.viewers, id).toContain(matrixColumn);
        }
    });
});
