/**
 * Which chrome a IIIF Cookbook recipe is best read with.
 *
 * The Cookbook's support matrix links `/viewer/` directly, so a reader arriving
 * from it lands on a manifest chosen to demonstrate one feature — and for a
 * whole class of recipes that feature is not on the canvas at all. A rights
 * statement, a `seeAlso` link or a commenting annotation is in a panel the
 * viewer opens closed; a language to switch to is behind the toolbar's locale
 * picker. Either way the reader is left looking at an image with no sign of the
 * thing the recipe is about.
 *
 * This is a courtesy of this route and of no other: core opens nothing on its
 * own, and a viewer that second-guessed its host's chrome configuration by
 * sniffing manifest URLs would be wrong everywhere but here.
 */

/** The panels a recipe can ask for. */
export type RecipePanel =
    | 'information'
    | 'annotations'
    | 'collection'
    | 'structures'
    | 'av';

/**
 * Recipes whose own feature is a descriptive property the information panel
 * renders — see core's `MetadataPanel`, which is what bounds this list: a
 * property the panel does not show is not worth opening it for.
 */
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

/**
 * Recipes carrying annotations that are *about* the canvas rather than painted
 * onto it. A recipe whose annotations only paint content — every manifest has
 * those — is not here: its annotation list would name the image the reader can
 * already see.
 */
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

/**
 * Recipes whose annotations are timed against a recording rather than placed on
 * an image. `@triiiceratops/plugin-av` lists those against the playhead in its
 * own panel, which is where they can be read in step with what is playing; the
 * annotation panel would list them as text detached from the audio they belong
 * to.
 */
const AV_RECIPES = ['0103-poetry-reading-annotations'] as const;

/**
 * Recipes whose feature is a `structures` table of contents. The ranges are the
 * recipe, and they are only ever seen in that panel.
 */
const STRUCTURES_RECIPES = [
    '0024-book-4-toc',
    '0025-newspaper-article-index',
    '0026-toc-opera',
    '0031-bound-multivolume',
    '0064-opera-one-canvas',
    '0065-opera-multiple-canvases',
] as const;

/**
 * `0029-metadata-anywhere` is deliberately in none of these lists, not even
 * `CANVAS_INFO_RECIPES`.
 *
 * Its subject is metadata on a canvas rather than on the manifest, and core
 * surfaces that through the canvas information button on the nav bar — which
 * stands in the open the moment the canvas carries anything, with no toolbar and
 * no panel involved. The metadata is the recipe, and finding it under that button
 * is the reading the recipe asks for; opening the popover would hand over the
 * answer and hide the control that gives it.
 */

/**
 * Recipes whose top resource is a Collection. The members are the recipe — a
 * viewer that opened one of them and nothing else would be showing a plain
 * manifest and calling it a collection recipe.
 *
 * Harmless on the manifest a reader may arrive at instead: core renders the
 * panel only once it actually holds a collection.
 */
const COLLECTION_RECIPES = [
    '0030-multi-volume',
    '0032-collection',
    '0230-navdate',
] as const;

/**
 * Recipes whose feature hangs off the canvas rather than the manifest, and so is
 * read through the nav bar's canvas information button instead of a panel.
 *
 * `0017-transcription-av` is the case: its manifest carries nothing but a label,
 * and the transcription the recipe exists for is a `rendering` on the canvas. The
 * information panel would open on an empty descriptive record while the download
 * sat unopened behind a button elsewhere on the bar.
 *
 * Not where `0029-metadata-anywhere` belongs: that recipe reaches the same button,
 * and pressing it is the reader's to do — see the note above.
 */
export const CANVAS_INFO_RECIPES: ReadonlySet<string> = new Set([
    '0017-transcription-av',
]);

/**
 * Recipes that open no panel but whose feature is a toolbar control: the reader
 * has to find a button for the recipe to be about anything.
 */
export const TOOLBAR_ONLY_RECIPES: ReadonlySet<string> = new Set([
    '0027-alternative-page-order',
]);

/** Recipe id to the panel it opens with. Keyed by the id the Cookbook publishes. */
export const RECIPE_PANELS: ReadonlyMap<string, RecipePanel> = new Map([
    ...INFORMATION_RECIPES.map((id) => [id, 'information'] as const),
    ...ANNOTATION_RECIPES.map((id) => [id, 'annotations'] as const),
    ...COLLECTION_RECIPES.map((id) => [id, 'collection'] as const),
    ...STRUCTURES_RECIPES.map((id) => [id, 'structures'] as const),
    ...AV_RECIPES.map((id) => [id, 'av'] as const),
]);

/** The chrome a recognised recipe opens with. */
export interface RecipeChrome {
    /** The panel to open, or `undefined` for a recipe that opens none. */
    panel?: RecipePanel;
    /** Whether to open the nav bar's canvas information popover. */
    canvasInfo?: boolean;
}

/**
 * The path segments of a manifest id, query and fragment dropped.
 *
 * The domain is not read: the Cookbook is a static site read as often from a
 * working copy as from `iiif.io`, so the same recipe is
 * `iiif.io/api/cookbook/recipe/<id>/manifest.json` published and
 * `localhost:4000/recipe/<id>/manifest.json` under its dev server. The path is
 * what the two have in common.
 *
 * A manifest id is not required to be absolute, so a string `URL` cannot parse
 * is read as the path it already is rather than refused.
 */
function pathSegments(manifestId: string): string[] {
    try {
        return new URL(manifestId).pathname.split('/');
    } catch {
        return manifestId.split(/[?#]/)[0].split('/');
    }
}

/**
 * The chrome to open for a manifest, or `undefined` to leave it alone.
 *
 * The id is the segment after a segment that is exactly `recipe` — matched
 * whole, so a directory merely containing the word is not one — and it has to be
 * an id one of the tables names. Everything around that is free: how deep the
 * recipe tree is mounted, which file in it the manifest is, and what follows.
 *
 * The toolbar is not a third table because it has no case of its own. Whatever
 * the recipe is about is reached through a toolbar button — the locale picker
 * for a multilingual recipe, the sequence picker for an alternative page order,
 * and for a recipe that opens a panel, the very button that panel answers to. A
 * recipe recognised here is one whose reader needs the bar, so recognising it is
 * the whole of the condition.
 */
export function recipeChrome(
    manifestId: string | null | undefined,
): RecipeChrome | undefined {
    if (!manifestId) return undefined;
    const segments = pathSegments(manifestId);
    // The last one: a recipe lives under the deepest `recipe/` on the path, and
    // anything above it is where the Cookbook happens to be mounted.
    const index = segments.lastIndexOf('recipe');
    if (index < 0) return undefined;

    const id = segments[index + 1] ?? '';
    const panel = RECIPE_PANELS.get(id);
    if (panel) return { panel };
    if (CANVAS_INFO_RECIPES.has(id)) return { canvasInfo: true };
    return TOOLBAR_ONLY_RECIPES.has(id) ? {} : undefined;
}
