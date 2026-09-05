import { describe, expect, it } from 'vitest';

import { COOKBOOK_RECIPES, RECIPE_GROUP_LABELS, recipeNumber } from './recipes';

/**
 * The 15 audiovisual recipe ids derived and verified in
 * `packages/core/src/lib/test/fixtures/manifests/PROVENANCE.md`. Duplicated
 * here so the catalog cannot drift from that derivation without this test going
 * red.
 */
const AUDIOVISUAL_IDS = [
    '0002-mvm-audio',
    '0003-mvm-video',
    '0013-placeholderCanvas',
    '0014-accompanyingcanvas',
    '0015-start',
    '0017-transcription-av',
    '0026-toc-opera',
    '0064-opera-one-canvas',
    '0065-opera-multiple-canvases',
    '0074-multiple-language-captions',
    '0103-poetry-reading-annotations',
    '0219-using-caption-file',
    '0229-behavior-ranges',
    '0434-choice-av',
    '0489-multimedia-canvas',
];

describe('cookbook recipe catalog consistency', () => {
    it('gives every entry a renderable group', () => {
        const unrenderable = COOKBOOK_RECIPES.filter(
            (recipe) => !(recipe.group in RECIPE_GROUP_LABELS),
        ).map((recipe) => `${recipe.id}: ${recipe.group}`);
        expect(unrenderable).toEqual([]);
    });

    it('gives every non-supported entry a reason', () => {
        const unexplained = COOKBOOK_RECIPES.filter(
            (recipe) =>
                recipe.support !== 'supported' && !recipe.reason?.trim(),
        ).map((recipe) => `${recipe.id}: ${recipe.support}`);
        expect(unexplained).toEqual([]);
    });

    it('has one entry per recipe, with a well-formed id and manifest URL', () => {
        const ids = COOKBOOK_RECIPES.map((recipe) => recipe.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const recipe of COOKBOOK_RECIPES) {
            expect(recipe.id).toMatch(/^\d{4}-\S+$/);
            expect(recipeNumber(recipe)).toMatch(/^\d{4}$/);
            expect(recipe.name.trim()).not.toBe('');
            expect(recipe.manifestUrl).toMatch(
                new RegExp(
                    `^https://iiif\\.io/api/cookbook/recipe/${recipe.id}/[\\w-]+\\.json$`,
                ),
            );
        }
    });

    it('covers the 67 recipes the support matrix deduplicates to', () => {
        expect(COOKBOOK_RECIPES).toHaveLength(67);
    });

    it("audiovisual group is exactly PROVENANCE.md's 15 ids", () => {
        const audiovisual = COOKBOOK_RECIPES.filter(
            (recipe) => recipe.group === 'audiovisual',
        ).map((recipe) => recipe.id);
        expect(audiovisual.sort()).toEqual([...AUDIOVISUAL_IDS].sort());
    });

    it('marks exactly the audiovisual recipes as needing plugin-av', () => {
        const needsPlugin = COOKBOOK_RECIPES.filter(
            (recipe) => recipe.requiresPluginAv,
        ).map((recipe) => recipe.id);
        expect(needsPlugin.sort()).toEqual([...AUDIOVISUAL_IDS].sort());
    });
});
