import {
    COOKBOOK_RECIPES,
    RECIPE_GROUP_LABELS,
    recipeNumber,
    type CookbookRecipe,
    type RecipeGroup,
} from '@triiiceratops/cookbook';

export interface ManifestEntry {
    label: string;
    url: string;
    support?: CookbookRecipe['support'];
    reason?: string;
}

export interface ManifestSection {
    key: string;
    heading: string;
    entries: ManifestEntry[];
}

function recipeEntry(recipe: CookbookRecipe): ManifestEntry {
    return {
        label: `${recipeNumber(recipe)} ${recipe.name}`,
        url: recipe.manifestUrl,
        support: recipe.support,
        reason: recipe.reason,
    };
}

export const DEFAULT_MANIFEST_URL = COOKBOOK_RECIPES[0].manifestUrl;

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

const PRESENTATION_4_SIBLINGS: ManifestEntry[] = [
    {
        label: '0001 Simplest Manifest - Single Image File',
        url: 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/v4/manifest.json',
    },
    {
        label: '0002 Simplest Manifest - Audio',
        url: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/v4/manifest.json',
    },
    {
        label: '0003 Simplest Manifest - Video',
        url: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/v4/manifest.json',
    },
    {
        label: '0219 Using Caption Files with Video Content',
        url: 'https://iiif.io/api/cookbook/recipe/0219-using-caption-file/v4/manifest.json',
    },
];

export const PRESENTATION_4_MANIFESTS: ManifestEntry[] = [
    ...PRESENTATION_4_SIBLINGS,
    ...COOKBOOK_RECIPES.filter((recipe) =>
        recipe.manifestUrl.includes('/v4/'),
    ).map(recipeEntry),
].sort((a, b) => a.label.localeCompare(b.label));

/* Third-party HLS behind expiring tokens: re-fetch to play, don't cache. Only live waveform source found. */
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

export const LOCAL_MANIFESTS: ManifestEntry[] = [
    {
        label: 'Multi-Target Annotation Array',
        url: '/material/multi-target-array/manifest.json',
    },
];

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
        section.entries.push(recipeEntry(recipe));
    }
    return [...sections.values()];
}
