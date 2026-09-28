/** Which chrome a Cookbook recipe is best read with: core opens nothing on its own. */

export type RecipePanel =
    | 'information'
    | 'annotations'
    | 'collection'
    | 'structures'
    | 'av';

const INFORMATION_RECIPES = [
    '0006-text-language',
    '0007-string-formats',
    '0008-rights',
    '0046-rendering',
    '0047-homepage',
    '0053-seeAlso',
    '0117-add-image-thumbnail',
    '0118-multivalue',
    '0234-provider',
] as const;

const ANNOTATION_RECIPES = [
    '0019-html-in-annotations',
    '0021-tagging',
    '0022-linking-with-a-hotspot',
    '0045-css',
    '0135-annotating-point-in-canvas',
    '0258-tagging-external-resource',
    '0261-non-rectangular-commenting',
    '0266-full-canvas-annotation',
    '0269-embedded-or-referenced-annotations',
    '0306-linking-annotations-to-manifests',
    '0309-annotation-collection',
    '0326-annotating-image-layer',
    '0346-multilingual-annotation-body',
    '0377-image-in-annotation',
] as const;

const AV_RECIPES = ['0103-poetry-reading-annotations'] as const;

const STRUCTURES_RECIPES = [
    '0024-book-4-toc',
    '0025-newspaper-article-index',
    '0026-toc-opera',
    '0031-bound-multivolume',
    '0064-opera-one-canvas',
    '0065-opera-multiple-canvases',
] as const;

/* `0029-metadata-anywhere` is deliberately in none of these lists: its metadata surfaces through the canvas button unopened. */

const COLLECTION_RECIPES = [
    '0030-multi-volume',
    '0032-collection',
    '0230-navdate',
] as const;

export const CANVAS_INFO_RECIPES: ReadonlySet<string> = new Set([
    '0017-transcription-av',
]);

export const TOOLBAR_ONLY_RECIPES: ReadonlySet<string> = new Set([
    '0027-alternative-page-order',
]);

export const RECIPE_PANELS: ReadonlyMap<string, RecipePanel> = new Map([
    ...INFORMATION_RECIPES.map((id) => [id, 'information'] as const),
    ...ANNOTATION_RECIPES.map((id) => [id, 'annotations'] as const),
    ...COLLECTION_RECIPES.map((id) => [id, 'collection'] as const),
    ...STRUCTURES_RECIPES.map((id) => [id, 'structures'] as const),
    ...AV_RECIPES.map((id) => [id, 'av'] as const),
]);

export interface RecipeChrome {
    panel?: RecipePanel;
    canvasInfo?: boolean;
}

function pathSegments(manifestId: string): string[] {
    try {
        return new URL(manifestId).pathname.split('/');
    } catch {
        return manifestId.split(/[?#]/)[0].split('/');
    }
}

export function recipeChrome(
    manifestId: string | null | undefined,
): RecipeChrome | undefined {
    if (!manifestId) return undefined;
    const segments = pathSegments(manifestId);
    const index = segments.lastIndexOf('recipe');
    if (index < 0) return undefined;

    const id = segments[index + 1] ?? '';
    const panel = RECIPE_PANELS.get(id);
    if (panel) return { panel };
    if (CANVAS_INFO_RECIPES.has(id)) return { canvasInfo: true };
    return TOOLBAR_ONLY_RECIPES.has(id) ? {} : undefined;
}
