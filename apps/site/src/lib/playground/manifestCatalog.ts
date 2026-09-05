/*
 * What the playground's recipe browser can load.
 *
 * The Cookbook recipes come from `@triiiceratops/cookbook`, the workspace's one
 * catalog, which is also what the documentation's support counts are generated
 * from; only the manifests that have no catalog entry are listed here.
 */

import {
    COOKBOOK_RECIPES,
    RECIPE_GROUP_LABELS,
    recipeNumber,
    type CookbookRecipe,
    type RecipeGroup,
} from '@triiiceratops/cookbook';

/** One loadable manifest in the browser's list. */
export interface ManifestEntry {
    label: string;
    url: string;
    /** Absent for a manifest with no catalog entry: nothing claims a status for it. */
    support?: CookbookRecipe['support'];
    reason?: string;
}

export interface ManifestSection {
    key: string;
    heading: string;
    entries: ManifestEntry[];
}

/** What loads when the URL names no manifest. */
export const DEFAULT_MANIFEST_URL = COOKBOOK_RECIPES[0].manifestUrl;

/**
 * Institutional manifests: real-world IIIF from five different implementations,
 * none of which is a Cookbook recipe. They exercise the viewer against the
 * variation that only production servers produce.
 */
export const INSTITUTIONAL_MANIFESTS: ManifestEntry[] = [
    {
        label: 'Wellcome Collection (b18035723)',
        url: 'https://iiif.wellcomecollection.org/presentation/v2/b18035723',
    },
    {
        label: 'Self-Portrait Dedicated to Paul Gauguin',
        url: 'https://iiif.harvardartmuseums.org/manifests/object/299843',
    },
    {
        label: 'CSNTM (MNTGRCP40)',
        url: 'https://collections.csntm.org/image-service/iiif/artifacts/MNTGRCP40/default/manifest/',
    },
    {
        label: 'Bodleian Library MS. Ind. Inst. Misc. 22',
        url: 'https://iiif.bodleian.ox.ac.uk/iiif/manifest/e32a277e-91e2-4a6d-8ba6-cc4bad230410.json',
    },
    {
        label: 'Yugoslavia',
        url: 'https://zavicajna.digitalna.rs/iiif/api/presentation/3/96571949-03d6-478e-ab44-a2d5ad68f935%252F00000001%252Fostalo01%252F00000071/manifest',
    },
];

/**
 * Live Avalon Media System manifests whose canvases link real waveform data.
 *
 * These are the only public deployment found still serving the bytes: the canvas
 * `seeAlso` is a `Dataset` of `application/json` pointing at
 * `master_files/<id>/waveform.json`, which is the Avalon half of the linkage
 * contract in `@triiiceratops/plugin-av`'s `waveformLink`. The Avalon project's
 * own demo instance advertises the same shape but its waveform files now 404,
 * and the British Library's BBC-profile `.dat` shape has no reachable example at
 * all, so it is exercised only by fixtures.
 *
 * These are third-party URLs on someone else's server: they can go away without
 * notice, and their media bodies are HLS behind expiring tokens, so the manifest
 * has to be re-fetched to play rather than cached and replayed.
 */
export const WAVEFORM_MANIFESTS: ManifestEntry[] = [
    {
        label: 'IU — A Mende Song (waveform, 1 canvas)',
        url: 'https://media.dlib.indiana.edu/media_objects/rv043j64d/manifest',
    },
    {
        label: 'IU — Reminisce-In (waveform, 2 canvases, ~6 MB each)',
        url: 'https://media.dlib.indiana.edu/media_objects/8k71np66t/manifest',
    },
];

/**
 * Manifests vendored into the site's `static/material`, for shapes the Cookbook
 * does not publish an example of.
 *
 * `material/` is the site's own fixture tree — the same one the marketing pages'
 * embedded viewers load, and a path the URL contract accounts for as host
 * material rather than as a public URL.
 */
export const LOCAL_MANIFESTS: ManifestEntry[] = [
    {
        label: 'Multi-Target Annotation Array',
        url: '/material/multi-target-array/manifest.json',
    },
];

/**
 * The catalog's recipes as sections, in the order the groups first appear in the
 * catalog. A group with no recipes yields no section.
 */
export function groupRecipes(
    recipes: CookbookRecipe[] = COOKBOOK_RECIPES,
): ManifestSection[] {
    const sections = new Map<RecipeGroup, ManifestSection>();
    for (const recipe of recipes) {
        let section = sections.get(recipe.group);
        if (!section) {
            section = {
                key: recipe.group,
                heading: RECIPE_GROUP_LABELS[recipe.group],
                entries: [],
            };
            sections.set(recipe.group, section);
        }
        section.entries.push({
            label: `${recipeNumber(recipe)} ${recipe.name}`,
            url: recipe.manifestUrl,
            support: recipe.support,
            reason: recipe.reason,
        });
    }
    return [...sections.values()];
}
