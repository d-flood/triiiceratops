/**
 * The IIIF Cookbook recipe catalog: the single source for what Triiiceratops
 * supports, and the only place a support claim is recorded. Every recipe number
 * in `docs/bundle-size-comparison.md` is generated from here by
 * `scripts/docs-recipes.mjs`, whose `--check` gate fails the documentation build
 * when the two disagree.
 */

/** The Cookbook's own categories, with its audiovisual recipes gathered into one group. */
export type RecipeGroup =
    | 'basic'
    | 'images'
    | 'properties'
    | 'annotations'
    | 'structures'
    | 'geo'
    | 'content-state'
    | 'audiovisual';

export type RecipeSupport = 'supported' | 'partial' | 'unsupported';

export interface CookbookRecipe {
    /** Cookbook recipe id, e.g. `0489-multimedia-canvas`. Its numeric prefix is the recipe number. */
    id: string;
    /** The recipe's own title, as the Cookbook publishes it. */
    name: string;
    /**
     * The manifest or collection to load. A recipe that publishes several named
     * manifests records the one the demo picker and the specs use.
     */
    manifestUrl: string;
    /**
     * The Cookbook's own category, except that `'audiovisual'` gathers the 15 ids
     * derived and verified in the manifest fixtures' `PROVENANCE.md`
     * (`packages/core/src/lib/test/fixtures/manifests/`) — the recipes whose
     * manifests carry a `Sound` or `Video` painting body.
     */
    group: RecipeGroup;
    /**
     * `'partial'` is a distinct claim, not a weaker `'supported'`: a recipe that
     * renders but whose own feature is not honoured.
     */
    support: RecipeSupport;
    /** True for a recipe that needs `@triiiceratops/plugin-av` to reach its `support` level. */
    requiresPluginAv: boolean;
    /**
     * True when the Cookbook support matrix's own Triiiceratops cell reads Yes.
     * An external claim we carry so the documentation can cite the matrix without
     * attributing our own `support` status to it; the two can legitimately differ.
     */
    matrixSupport: boolean;
    /** Why the recipe is not fully supported. Required whenever `support` is not `'supported'`. */
    reason?: string;
}

/** Human-readable group names. A group missing here is not renderable. */
export const RECIPE_GROUP_LABELS: Record<RecipeGroup, string> = {
    basic: 'Basic recipes',
    images: 'Image recipes',
    properties: 'IIIF properties',
    annotations: 'Annotation recipes',
    structures: 'Structuring resources',
    geo: 'Geo recipes',
    'content-state': 'Content State',
    audiovisual: 'Audio & video',
};

/** The recipe number a recipe id starts with, e.g. `'0489'`. */
export function recipeNumber(recipe: CookbookRecipe): string {
    return recipe.id.slice(0, recipe.id.indexOf('-'));
}

/**
 * The Cookbook [support matrix](https://iiif.io/api/cookbook/recipe/matrix/)
 * deduplicated to its 67 distinct recipes.
 */
export const COOKBOOK_RECIPES: CookbookRecipe[] = [
    {
        id: '0001-mvm-image',
        name: 'Simplest Manifest - Single Image File',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0002-mvm-audio',
        name: 'Simplest Manifest - Audio',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0003-mvm-video',
        name: 'Simplest Manifest - Video',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0004-canvas-size',
        name: 'Image and Canvas with Differing Dimensions',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0004-canvas-size/manifest.json',
        group: 'images',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0005-image-service',
        name: 'Support Deep Viewing with Basic Use of a IIIF Image Service',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0006-text-language',
        name: 'Internationalization and Multi-language Values (label, summary, metadata, requiredStatement)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0006-text-language/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0007-string-formats',
        name: 'Embedding HTML in descriptive properties (label, summary, metadata, requiredStatement)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0007-string-formats/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0008-rights',
        name: 'Rights statement (rights, requiredStatement)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0008-rights/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0009-book-1',
        name: 'Simple Manifest - Book',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0010-book-2-viewing-direction',
        name: 'Viewing direction and Its Effect on Navigation (viewingDirection)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0011-book-3-behavior',
        name: "Book 'behavior' Variations (continuous, individuals) (behaviorimage)",
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0011-book-3-behavior/manifest-continuous.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0013-placeholderCanvas',
        name: 'Load a Preview Image Before the Main Content (placeholderCanvas)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0014-accompanyingcanvas',
        name: 'Audio Presentation with Accompanying Image (accompanyingCanvas)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0015-start',
        name: 'Begin playback at a specific point - Time-based media (start)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0015-start/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0017-transcription-av',
        name: 'Providing Access to Transcript Files of A/V Content (rendering)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0017-transcription-av/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0019-html-in-annotations',
        name: 'HTML in Annotations',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0019-html-in-annotations/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0021-tagging',
        name: 'Simple Annotation — Tagging',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0021-tagging/manifest.json',
        group: 'annotations',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0022-linking-with-a-hotspot',
        name: 'Redirecting from one Canvas to another resource (Hotspot linking)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0022-linking-with-a-hotspot/manifest.json',
        group: 'annotations',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0024-book-4-toc',
        name: 'Table of Contents for Book Chapters (structures)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0025-newspaper-article-index',
        name: 'Navigation by Newspaper Article (structures)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0025-newspaper-article-index/manifest.json',
        group: 'structures',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0026-toc-opera',
        name: 'Table of Contents for A/V Content',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0026-toc-opera/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0027-alternative-page-order',
        name: 'Alternative Page Sequences',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0027-alternative-page-order/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0029-metadata-anywhere',
        name: 'Metadata on any Resource (metadata)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0029-metadata-anywhere/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0030-multi-volume',
        name: 'Multi-volume Work with Individually-bound Volumes',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0030-multi-volume/collection.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0031-bound-multivolume',
        name: 'Multiple Volumes in a Single Bound Volume',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0031-bound-multivolume/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0032-collection',
        name: 'Simple Collection',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0032-collection/collection.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0033-choice',
        name: 'Multiple Choice of Images in a Single View (Canvas)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0035-foldouts',
        name: 'Foldouts, Flaps, and Maps (behavior)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0035-foldouts/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0036-composition-from-multiple-images',
        name: 'Composition from Multiple Images',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
        group: 'structures',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0040-image-rotation-service',
        name: 'Image Rotation Two Ways',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0040-image-rotation-service/manifest.json',
        group: 'images',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0045-css',
        name: 'CSS in an Annotation',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0045-css/manifest.json',
        group: 'basic',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0046-rendering',
        name: 'Providing Alternative Representations (rendering)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0046-rendering/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0047-homepage',
        name: 'Linking to Web Page of an Object (homepage)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0047-homepage/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0053-seeAlso',
        name: 'Linking to Structured Metadata (seeAlso)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0053-seeAlso/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0064-opera-one-canvas',
        name: 'Table of Contents for Multiple A/V Files on a Single Canvas (start)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0065-opera-multiple-canvases',
        name: 'Table of Contents for Multiple A/V Files on Multiple Canvases',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0065-opera-multiple-canvases/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0074-multiple-language-captions',
        name: 'Using Caption and Subtitle Files in Multiple Languages with Video Content',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0074-multiple-language-captions/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0103-poetry-reading-annotations',
        name: 'Scholarly Annotation of a Poetry Reading',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0103-poetry-reading-annotations/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0117-add-image-thumbnail',
        name: 'Image Thumbnail for Manifest (thumbnail)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0117-add-image-thumbnail/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0118-multivalue',
        name: 'Displaying Multiple Values with Language Maps (label, summary, metadata, requiredStatement)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0118-multivalue/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0135-annotating-point-in-canvas',
        name: 'Annotating a specific point of an image',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0135-annotating-point-in-canvas/manifest.json',
        group: 'annotations',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0139-geolocate-canvas-fragment',
        name: 'Represent Canvas Fragment as a Geographic Area in a Web Mapping Client',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0139-geolocate-canvas-fragment/manifest.json',
        group: 'geo',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0154-geo-extension',
        name: 'Locate a Manifest on a Web Map',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0154-geo-extension/manifest.json',
        group: 'geo',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0202-start-canvas',
        name: 'Load Manifest Beginning with a Specific Canvas (start)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0202-start-canvas/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0219-using-caption-file',
        name: 'Using Caption and Subtitle Files with Video Content',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0219-using-caption-file/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0229-behavior-ranges',
        name: 'Adding Thumbnail Navigation and no-nav to a Video Resource',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0229-behavior-ranges/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0230-navdate',
        name: 'Navigation by Chronology (navDate)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0230-navdate/navdate-collection.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0234-provider',
        name: 'Acknowledge Content Contributors (provider)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0234-provider/manifest.json',
        group: 'properties',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0240-navPlace-on-canvases',
        name: 'Locate Multiple Canvases on a Web Map',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0240-navPlace-on-canvases/manifest.json',
        group: 'geo',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0258-tagging-external-resource',
        name: 'Tagging with an External Resource',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0258-tagging-external-resource/manifest.json',
        group: 'annotations',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0261-non-rectangular-commenting',
        name: 'Annotation with a Non-Rectangular Polygon',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0261-non-rectangular-commenting/manifest.json',
        group: 'annotations',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0266-full-canvas-annotation',
        name: 'Simplest Annotation',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0266-full-canvas-annotation/manifest.json',
        group: 'annotations',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0269-embedded-or-referenced-annotations',
        name: 'Embedded or referenced Annotations',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0269-embedded-or-referenced-annotations/manifest.json',
        group: 'annotations',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0283-missing-image',
        name: 'Missing Images in a Sequence',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0283-missing-image/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0299-region',
        name: 'Addressing a Spatial Region',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0299-region/manifest.json',
        group: 'basic',
        support: 'supported',
        requiresPluginAv: false,
        matrixSupport: true,
    },
    {
        id: '0306-linking-annotations-to-manifests',
        name: 'Linking external Annotations targeting a Canvas to a Manifest',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0306-linking-annotations-to-manifests/manifest.json',
        group: 'annotations',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0309-annotation-collection',
        name: 'Grouping Annotations into Collections',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0309-annotation-collection/manifest.json',
        group: 'basic',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0318-navPlace-navDate',
        name: 'Locating an Item in Place and Time',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0318-navPlace-navDate/manifest.json',
        group: 'geo',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0326-annotating-image-layer',
        name: 'Annotate specific images or layers',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0326-annotating-image-layer/manifest.json',
        group: 'annotations',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0346-multilingual-annotation-body',
        name: 'Annotating in Multiple Languages',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/manifest.json',
        group: 'annotations',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0377-image-in-annotation',
        name: 'Image in Annotations',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0377-image-in-annotation/manifest.json',
        group: 'basic',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0434-choice-av',
        name: 'Multiple Choice of Audio Formats in a Single View (Canvas)',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
        group: 'audiovisual',
        support: 'supported',
        requiresPluginAv: true,
        matrixSupport: false,
    },
    {
        id: '0466-link-for-loading-manifest',
        name: 'Sharing a link to open a Manifest in a specific viewer',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0466-link-for-loading-manifest/manifest.json',
        group: 'content-state',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0485-contentstate-canvas-region',
        name: 'Open a specific region of a Canvas in a viewer',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0485-contentstate-canvas-region/manifest.json',
        group: 'content-state',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0489-multimedia-canvas',
        name: 'Rendering Multiple Media Types on a Time-Based Canvas',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0489-multimedia-canvas/manifest.json',
        group: 'audiovisual',
        support: 'partial',
        requiresPluginAv: true,
        matrixSupport: false,
        reason: 'A painting body targeted at `#xywh=` is not placed within the canvas: the canvas plays under `plugin-av`, but degrades to its image body with a developer-console warning. Documented degradation — see the spatial-placement fence in `docs/plugin-av.md`.',
    },
    {
        id: '0540-link-for-opening-multiple-canvases',
        name: 'Sharing a link for opening two or more Canvases',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0540-link-for-opening-multiple-canvases/manifest.json',
        group: 'content-state',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
    {
        id: '0599-drag-and-drop',
        name: 'Drag and Drop',
        manifestUrl:
            'https://iiif.io/api/cookbook/recipe/0599-drag-and-drop/manifest.json',
        group: 'content-state',
        support: 'unsupported',
        requiresPluginAv: false,
        matrixSupport: false,
        reason: 'The Cookbook support matrix records no support for this recipe.',
    },
];
