/**
 * The bare viewer's Cookbook courtesy. Every id it names has to be a recipe the
 * workspace catalog knows, so a renamed or retired recipe fails here rather than
 * silently opening nothing for a reader arriving from the support matrix.
 */

import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';
import { describe, expect, it } from 'vitest';

import {
    RECIPE_PANELS,
    TOOLBAR_ONLY_RECIPES,
    recipeChrome,
} from '$lib/bare-viewer/recipePanels';

const CATALOG_IDS = new Set(COOKBOOK_RECIPES.map((recipe) => recipe.id));

/** The panel a manifest opens with, or `undefined` for no recognised recipe. */
function panelFor(manifestId: string | null | undefined) {
    return recipeChrome(manifestId)?.panel;
}

function manifestUrl(id: string) {
    return `https://iiif.io/api/cookbook/recipe/${id}/manifest.json`;
}

describe('the recipe tables', () => {
    it('name only recipes the catalog carries', () => {
        const named = [...RECIPE_PANELS.keys(), ...TOOLBAR_ONLY_RECIPES];
        expect(named.filter((id) => !CATALOG_IDS.has(id))).toEqual([]);
    });

    it('do not claim the same recipe twice', () => {
        const both = [...TOOLBAR_ONLY_RECIPES].filter((id) =>
            RECIPE_PANELS.has(id),
        );
        expect(both).toEqual([]);
    });
});

describe('recipePanel', () => {
    it('opens the information panel for a descriptive-property recipe', () => {
        expect(panelFor(manifestUrl('0006-text-language'))).toBe('information');
    });

    it('opens the collection panel for a collection recipe', () => {
        // Served as `collection.json`: the recipe directory identifies it, not
        // the file in it.
        expect(
            panelFor(
                'http://localhost:4000/recipe/0032-collection/collection.json',
            ),
        ).toBe('collection');
    });

    it('opens the collection panel for a member of that collection', () => {
        // The viewer may settle on a member manifest rather than the collection
        // document; the Cookbook serves both from the recipe's own directory.
        expect(
            panelFor(
                'http://localhost:4000/recipe/0032-collection/manifest-01.json',
            ),
        ).toBe('collection');
    });

    it('opens the structures panel for a table-of-contents recipe', () => {
        expect(panelFor(manifestUrl('0024-book-4-toc'))).toBe('structures');
        expect(panelFor(manifestUrl('0025-newspaper-article-index'))).toBe(
            'structures',
        );
        // Time-based ranges are the same panel as page ranges, whether the
        // recipe spreads its media over one canvas or several.
        expect(panelFor(manifestUrl('0026-toc-opera'))).toBe('structures');
        expect(panelFor(manifestUrl('0064-opera-one-canvas'))).toBe(
            'structures',
        );
        expect(panelFor(manifestUrl('0065-opera-multiple-canvases'))).toBe(
            'structures',
        );
    });

    it('sends a timed-annotation recipe to the AV panel, not the annotations one', () => {
        expect(panelFor(manifestUrl('0103-poetry-reading-annotations'))).toBe(
            'av',
        );
    });

    it('opens the annotation panel for an annotation recipe', () => {
        expect(panelFor(manifestUrl('0266-full-canvas-annotation'))).toBe(
            'annotations',
        );
    });

    it('leaves the chrome alone for a canvas-metadata recipe', () => {
        // 0029's subject is the canvas information button, which needs neither
        // the toolbar nor a panel — both would only cover the view it sits on.
        expect(
            recipeChrome(manifestUrl('0029-metadata-anywhere')),
        ).toBeUndefined();
    });

    it('leaves the chrome alone for a recipe with nothing to point at', () => {
        expect(panelFor(manifestUrl('0001-mvm-image'))).toBeUndefined();
    });

    it('leaves the chrome alone for a manifest that is not a recipe', () => {
        expect(
            panelFor(
                'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
            ),
        ).toBeUndefined();
        expect(panelFor(null)).toBeUndefined();
    });

    it('recognises a recipe served from a local copy of the Cookbook', () => {
        // The Cookbook is a static site, and someone writing a recipe runs it
        // at a bare path on their own machine. The recipe is the same recipe.
        expect(
            panelFor(
                'http://localhost:4000/recipe/0006-text-language/manifest.json',
            ),
        ).toBe('information');
    });

    it('answers for a path that only looks like a recipe id', () => {
        // The table is a plain lookup, and `constructor` is a key every object
        // inherits. Nothing on a prototype is a panel.
        expect(
            panelFor('https://example.org/recipe/constructor/manifest.json'),
        ).toBeUndefined();
    });
});

describe('the shapes a recipe URL arrives in', () => {
    const shapes = [
        'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json',
        'http://localhost:4000/recipe/0006-text-language/manifest.json',
        'http://127.0.0.1:4000/recipe/0006-text-language/',
        'http://localhost:4000/recipe/0006-text-language',
        'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json?v=2',
        'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json#fragment',
        '/recipe/0006-text-language/manifest.json',
    ];

    it.each(shapes)('recognises %s', (url) => {
        expect(panelFor(url)).toBe('information');
    });
});

describe('what is not a recipe', () => {
    it('does not read a segment that merely contains the word', () => {
        expect(
            panelFor(
                'https://example.org/recipes/0006-text-language/manifest.json',
            ),
        ).toBeUndefined();
    });

    it('does not read a recipe id out of the host', () => {
        expect(
            panelFor('https://recipe.example.org/0006-text-language.json'),
        ).toBeUndefined();
    });

    it('takes the deepest recipe directory on the path', () => {
        expect(
            panelFor(
                'https://example.org/recipe/0001-mvm-image/recipe/0006-text-language/manifest.json',
            ),
        ).toBe('information');
    });
});

describe('the toolbar', () => {
    it('opens for a recipe whose feature is behind one of its buttons', () => {
        // 0006's languages are the locale picker's; the panel it also opens is
        // not where a reader switches between them.
        expect(recipeChrome(manifestUrl('0006-text-language'))).toBeDefined();
    });

    it('opens for a recipe that opens no panel at all', () => {
        const chrome = recipeChrome(manifestUrl('0027-alternative-page-order'));
        expect(chrome).toBeDefined();
        expect(chrome?.panel).toBeUndefined();
    });

    it('stays shut for a recipe with nothing to point at', () => {
        expect(recipeChrome(manifestUrl('0001-mvm-image'))).toBeUndefined();
    });
});
