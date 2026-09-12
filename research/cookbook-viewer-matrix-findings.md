# IIIF Viewer Matrix Coverage Findings

Research date: 2026-09-08.

## Result

**`54/67` is correct for the local `COOKBOOK_RECIPES` catalog, but it is not
the official IIIF Viewer Matrix coverage figure. The correct matrix-coverage
figure is `54/68` distinct recipe IDs.**

| Measure                                    |     Count |
| ------------------------------------------ | --------: |
| Official Viewer Matrix distinct recipe IDs |    **68** |
| Local `COOKBOOK_RECIPES` IDs               |    **67** |
| Locally assessed `supported` IDs           |    **54** |
| Official matrix IDs absent locally         |     **1** |
| Appropriate current coverage count         | **54/68** |

The absent official matrix recipe is
[`0608-mvm-3d`](https://github.com/IIIF/cookbook-recipes/blob/master/recipe/0608-mvm-3d/index.md),
_Simplest Manifest - Single 3D Model_. Its upstream front matter includes the
`basic` topic, which the matrix template renders, and the current rendered
matrix gives Triiiceratops a `No` cell. Therefore it adds one unsupported ID to
the matrix denominator: **54 supported and 14 not supported, of 68**.

## Method

1. Used the official
   [`recipe/matrix.md` generation template](https://github.com/IIIF/cookbook-recipes/blob/master/recipe/matrix.md)
   as the corpus definition. It iterates only its configured topics (`basic`,
   `property`, `structure`, `image`, `AV`, `annotation`, `content-state`, and
   `geo-recipes`), selects a recipe when its `topic` contains that key, and
   explicitly excludes `recipe.id == -1`.
2. Counted the unique recipe IDs emitted by the current official
   [rendered Viewer Matrix](https://iiif.io/api/cookbook/recipe/matrix/), rather
   than summing topic-section rows. The template permits a recipe to belong to
   multiple selected topics, so rows are not a denominator.
3. Compared that 68-ID set with the 67 IDs in local
   [`COOKBOOK_RECIPES`](../packages/cookbook/src/recipes.ts), then counted its
   `support: 'supported'` entries.

## Superseded Scope

The earlier **75-recipe** conclusion was a count of the upstream Cookbook
directory, not of the official Viewer Matrix. It is not relevant to matrix
coverage. In particular, `0464-reuse-manifest` must not be treated as a missing
matrix row: although its metadata names `basic`, its upstream ID is `-1`, which
the matrix template excludes. Recipes outside the template's selected topics
are likewise outside this measurement.
