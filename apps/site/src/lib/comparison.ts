/**
 * The size-and-capability page's figures, every one of them computed from a
 * committed data source at build time.
 *
 * Two sources and no third: `@triiiceratops/comparison` for the size axis — the
 * committed output of a browser-driven measurement — and `@triiiceratops/cookbook`
 * for the capability axis, which is the one place a Triiiceratops support claim
 * is recorded. Bar widths, scatter coordinates, ratios and headroom are all
 * derived here, so the page transcribes nothing and there is no second copy of a
 * figure to gate against a first.
 *
 * Coordinates are in the scatter's own `viewBox` units: x grows right, y grows
 * *down*, which is why a smaller viewer sits at a larger y.
 */

import {
    COMPETITORS,
    COOKBOOK_MATRIX,
    MEASURED_COMPARISON,
    type Competitor,
    type MeasuredSession,
    type MeasuredViewer,
    type SessionKind,
} from '@triiiceratops/comparison';
import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';

const { compression, measuredAt, sessionManifests, viewers } =
    MEASURED_COMPARISON;

export const MEASURED_AT = measuredAt;

/**
 * The measurement date as the page sets it. Formatted in UTC from the committed
 * `YYYY-MM-DD` so the string does not change with the machine that builds it.
 */
export const MEASURED_ON = new Date(
    `${measuredAt}T00:00:00Z`,
).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});
export const COMPRESSION = compression;
export const SESSION_MANIFESTS = sessionManifests;

/**
 * The Cookbook support matrix: what the capability axis counts against, and
 * where the per-recipe detail lives. The matrix itself stays off this site.
 */
export const MATRIX_URL = 'https://iiif.io/api/cookbook/recipe/matrix/';

const pinned = new Map<string, Competitor>(COMPETITORS.map((c) => [c.id, c]));

function pinnedEntry(id: string): Competitor {
    const competitor = pinned.get(id);
    // The comparison package's own suite asserts the two lists agree; failing
    // loudly here keeps a mismatch from rendering a chart with a hole in it.
    if (competitor === undefined) {
        throw new Error(`No pinned competitor named ${id}`);
    }
    return competitor;
}

function session(
    viewer: MeasuredViewer,
    kind: SessionKind,
): MeasuredSession | undefined {
    return viewer.sessions.find((entry) => entry.kind === kind);
}

/** A viewer's image session, which every measured viewer has. */
function imageSession(viewer: MeasuredViewer): MeasuredSession {
    const found = session(viewer, 'image');
    if (found === undefined) {
        throw new Error(`${viewer.id} has no image session`);
    }
    return found;
}

/**
 * The session a size figure states for a viewer: its audiovisual one where it
 * has one, and otherwise the only session it has. Every measured row but
 * Universal Viewer's fetches the same bytes either way; core alone plays no
 * time-based media, so an image session is the whole of it.
 */
function sizedSession(viewer: MeasuredViewer): MeasuredSession {
    return session(viewer, 'audiovisual') ?? imageSession(viewer);
}

/** Bytes as the page states them: KB of 1000, one decimal. */
export function kilobytes(bytes: number): string {
    return (bytes / 1000).toFixed(1);
}

/** Bytes as the table states them: grouped, so six digits stay readable. */
export function grouped(bytes: number): string {
    return bytes.toLocaleString('en-US');
}

// ---- The capability axis --------------------------------------------------

const supported = COOKBOOK_RECIPES.filter((r) => r.support === 'supported');

/**
 * What the coverage grid counts, from the recipe catalog.
 *
 * `withPlugin` is the row the grid draws for us: the size beside it is the
 * audiovisual session, so the capability beside that has to be the pair's.
 *
 * How far the Cookbook matrix's own Triiiceratops column runs behind this is
 * `MATRIX_LAG`, read from the matrix itself rather than from the catalog's
 * `matrixSupport` flags — the two disagree, and the matrix is the one making
 * the claim.
 */
export const RECIPES: {
    readonly total: number;
    readonly audiovisual: number;
    readonly withPlugin: number;
    readonly core: number;
    readonly pluginOnly: number;
} = {
    total: COOKBOOK_RECIPES.length,
    audiovisual: COOKBOOK_RECIPES.filter((r) => r.group === 'audiovisual')
        .length,
    withPlugin: supported.length,
    core: supported.filter((r) => !r.requiresPluginAv).length,
    pluginOnly: supported.filter((r) => r.requiresPluginAv).length,
};

// ---- Session sizes --------------------------------------------------------

const byImageGzip = [...viewers].sort(
    (a, b) => imageSession(a).gzip - imageSession(b).gzip,
);

// ---- The data table -------------------------------------------------------

export type SizeRow = {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly isSelf: boolean;
    readonly raw: number;
    readonly gzip: number;
    readonly brotli: number;
    /** How many times the core row's gzip this row is, or `null` for that row. */
    readonly timesCore: number | null;
};

const CORE_ID = 'triiiceratops';
const PAIR_ID = 'triiiceratops-av';

const coreGzip = imageSession(
    viewers.find((viewer) => viewer.id === CORE_ID) ??
        (() => {
            throw new Error('The comparison has no Triiiceratops core row');
        })(),
).gzip;

export const SIZE_ROWS: readonly SizeRow[] = byImageGzip.map((viewer) => {
    const measurement = imageSession(viewer);
    return {
        id: viewer.id,
        name: viewer.name,
        version: viewer.version,
        isSelf: viewer.isSelf,
        raw: measurement.raw,
        gzip: measurement.gzip,
        brotli: measurement.brotli,
        timesCore:
            viewer.id === CORE_ID
                ? null
                : Math.round((measurement.gzip / coreGzip) * 100) / 100,
    };
});

/**
 * The gzip bytes between the audiovisual pair and the next row above it — the
 * margin `pnpm size:check:pair` fails the build for losing — and that margin
 * as a percentage of the rival row, which is how the page states it.
 */
export const HEADROOM: {
    readonly competitor: string;
    readonly bytes: number;
    readonly percent: number;
} = (() => {
    const at = byImageGzip.findIndex((viewer) => viewer.id === PAIR_ID);
    const pair = byImageGzip[at];
    const next = byImageGzip[at + 1];
    if (pair === undefined || next === undefined) {
        throw new Error('The audiovisual pair is the largest row');
    }
    const above = imageSession(next).gzip;
    const bytes = above - imageSession(pair).gzip;
    return {
        competitor: next.name,
        bytes,
        percent: Math.round((bytes / above) * 1000) / 10,
    };
})();

// ---- The coverage grid ----------------------------------------------------

/**
 * The figure the page leads with: one row per viewer, a cell per recipe, and
 * that viewer's session size beside it. Coverage reads as filled length and
 * size reads as bar length, so "smaller" and "more capable" are the same
 * glance rather than two charts a reader has to hold against each other.
 *
 * Cells come from one source per row and the row says which. A rival's cells
 * are its own column of the Cookbook matrix; ours are
 * `@triiiceratops/cookbook`, the only place a Triiiceratops support claim is
 * recorded. The matrix's own Triiiceratops column is read too, but only to
 * state how far behind it runs — see `MATRIX_LAG`.
 */

/** What one cell says about one viewer and one recipe. */
export type CoverageCell = 'on' | 'partial' | 'off';

const marksByRecipe = new Map(
    COOKBOOK_MATRIX.recipes.map((recipe) => [recipe.id, recipe.marks]),
);

function matrixCell(column: string, recipeId: string): CoverageCell {
    const mark = marksByRecipe.get(recipeId)?.[column];
    // A recipe the matrix has never listed is not a claim either way, and
    // reading it as unsupported would credit us for a rival's silence.
    if (mark === undefined) return 'off';
    return mark === 'yes' ? 'on' : mark === 'partial' ? 'partial' : 'off';
}

/** The catalog's recipes in recipe-number order: the figure's column set. */
const catalogRecipes = [...COOKBOOK_RECIPES].sort((a, b) =>
    a.id.localeCompare(b.id),
);

export type CoverageRow = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    /** Cells reading `on`. */
    readonly recipes: number;
    /** Cells reading `partial`, which no Triiiceratops row can carry. */
    readonly partial: number;
    /** The session the size figure states for this viewer, in gzip bytes. */
    readonly gzip: number;
    /** Where this row's cells came from, for the figure's own disclosure. */
    readonly source: 'catalog' | 'matrix';
    /** Which session that is, since a row without an audiovisual one has no choice. */
    readonly sessionKind: SessionKind;
    /** One cell per catalog recipe, worked first — see `packed`. */
    readonly cells: readonly CoverageCell[];
};

/**
 * Cells are ordered by what they say, not by recipe number: worked, then
 * partial, then not. A row is then one filled length a reader can compare
 * against the row above it, which a fixed recipe order cannot be — the same
 * count scattered differently reads as a different amount.
 *
 * The cost is that a cell's position no longer identifies its recipe, and the
 * page says so. Nothing here reads a position as a recipe.
 */
const CELL_ORDER: Record<CoverageCell, number> = { on: 0, partial: 1, off: 2 };

function packed(cells: CoverageCell[]): CoverageCell[] {
    return [...cells].sort((a, b) => CELL_ORDER[a] - CELL_ORDER[b]);
}

function cellsFor(
    viewer: MeasuredViewer,
): { source: 'catalog' | 'matrix'; cells: CoverageCell[] } | undefined {
    if (viewer.isSelf) {
        // Core alone plays no time-based media, so it works the supported
        // recipes that do not need the audiovisual plugin — not the pair's.
        const worksIt = (recipe: (typeof catalogRecipes)[number]): boolean =>
            recipe.support === 'supported' &&
            (viewer.id !== CORE_ID || !recipe.requiresPluginAv);
        return {
            source: 'catalog',
            cells: packed(
                catalogRecipes.map((recipe) =>
                    worksIt(recipe) ? 'on' : 'off',
                ),
            ),
        };
    }
    const column = pinnedEntry(viewer.id).matrixColumn;
    if (column === undefined) return undefined;
    return {
        source: 'matrix',
        cells: packed(
            catalogRecipes.map((recipe) => matrixCell(column, recipe.id)),
        ),
    };
}

const rows: readonly CoverageRow[] = viewers.flatMap((viewer) => {
    const cells = cellsFor(viewer);
    if (cells === undefined) return [];
    // What this viewer ships to do the work its cells claim.
    const sized = sizedSession(viewer);
    return [
        {
            id: viewer.id,
            name: viewer.name,
            isSelf: viewer.isSelf,
            recipes: cells.cells.filter((cell) => cell === 'on').length,
            partial: cells.cells.filter((cell) => cell === 'partial').length,
            gzip: sized.gzip,
            sessionKind: sized.kind,
            source: cells.source,
            cells: cells.cells,
        },
    ];
});

/**
 * The coverage figure: the same rows, ordered by the axis that figure draws.
 *
 * Each figure sorts by its own measure, so the row at the top of one is the
 * best on that axis and nothing else is implied. The two are stacked and never
 * set side by side, which is what lets their orders differ without a reader
 * reading across from one to the other.
 */
export const COVERAGE: {
    /** How many recipes the grid is wide. */
    readonly total: number;
    /** Rows most capable first, ties broken by the smaller bundle. */
    readonly rows: readonly CoverageRow[];
    /** When the matrix the rival rows are drawn from was read. */
    readonly matrixReadAt: string;
} = {
    total: catalogRecipes.length,
    rows: [...rows].sort((a, b) => b.recipes - a.recipes || a.gzip - b.gzip),
    matrixReadAt: COOKBOOK_MATRIX.readAt,
};

export type BundleRow = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    /** The session this bar states, in gzip bytes. */
    readonly gzip: number;
    /** The bar's length, as a percentage of the largest row's session. */
    readonly sizePercent: number;
    /**
     * False for a viewer the coverage figure has no row for. Size is measurable
     * for anything a page can load; coverage is only claimable for a viewer the
     * matrix has a column for, and a canvas renderer is not asked the same
     * question as a manifest viewer.
     */
    readonly covered: boolean;
};

const coveredIds = new Set(rows.map((row) => row.id));
const largestSized = Math.max(
    ...viewers.map((viewer) => sizedSession(viewer).gzip),
);

/**
 * The bundle figure: every measured viewer, smallest first.
 *
 * Wider than the coverage figure on purpose. A viewer with no matrix column
 * still weighs something, and leaving it out of the size figure would drop a
 * measured competitor from the axis it can be compared on.
 */
export const BUNDLES: readonly BundleRow[] = viewers
    .map((viewer) => {
        const gzip = sizedSession(viewer).gzip;
        return {
            id: viewer.id,
            name: viewer.name,
            isSelf: viewer.isSelf,
            gzip,
            sizePercent: Math.round((gzip / largestSized) * 1000) / 10,
            covered: coveredIds.has(viewer.id),
        };
    })
    .sort((a, b) => a.gzip - b.gzip || a.name.localeCompare(b.name));

/**
 * The size figure's rows that the coverage figure has none of, named so the
 * caption can say which bars carry no cells rather than leaving the difference
 * between the two figures to be counted.
 */
export const SIZE_ONLY: readonly string[] = BUNDLES.filter(
    (row) => !row.covered,
).map((row) => row.name);

/**
 * Audiovisual coverage on its own, which the flat figure no longer shows and
 * the page therefore states: the recipes whose manifests carry time-based
 * media, how many the pair works, and the most any other row here works.
 *
 * This is the difference the comparison exists to make, so it is worth a
 * sentence of its own rather than being left inside a total.
 */
export const AV_COVERAGE: {
    readonly total: number;
    readonly self: number;
    readonly rivalBest: number;
    readonly rivalBestName: string;
} = (() => {
    const audiovisual = catalogRecipes.filter(
        (recipe) => recipe.group === 'audiovisual',
    );
    const worked = (row: CoverageRow): number => {
        if (row.isSelf) {
            return audiovisual.filter(
                (recipe) =>
                    recipe.support === 'supported' &&
                    (row.id !== CORE_ID || !recipe.requiresPluginAv),
            ).length;
        }
        const column = pinnedEntry(row.id).matrixColumn;
        if (column === undefined) return 0;
        return audiovisual.filter(
            (recipe) => matrixCell(column, recipe.id) === 'on',
        ).length;
    };
    const self = COVERAGE.rows.find((row) => row.id === PAIR_ID);
    const rivals = COVERAGE.rows.filter((row) => !row.isSelf);
    if (self === undefined || rivals.length === 0) {
        throw new Error('The coverage grid has no rows to compare');
    }
    const best = rivals
        .map((row) => ({ name: row.name, worked: worked(row) }))
        .sort((a, b) => b.worked - a.worked)[0];
    return {
        total: audiovisual.length,
        self: worked(self),
        rivalBest: best.worked,
        rivalBestName: best.name,
    };
})();

/**
 * The sentence the grid is drawn to support, computed rather than written: our
 * row, and the ceiling the rest of the field reaches.
 *
 * A ceiling and not a nominated rival. Three of these viewers are tied at the
 * top of the matrix and they span five times the bytes between them, so
 * choosing one to compare against decides the headline: the largest flatters
 * us and the smallest buries the point. Naming the tie and its size range
 * states the whole field instead of the convenient member of it.
 */
export const LEAD: {
    readonly selfRecipes: number;
    readonly selfKb: string;
    /** The most recipes any other row reaches. */
    readonly ceiling: number;
    /** Every other row at that ceiling, in the grid's own order. */
    readonly atCeiling: readonly string[];
    /** The smallest and largest session among the rows at the ceiling. */
    readonly ceilingFromKb: string;
    readonly ceilingToKb: string;
    /**
     * True while every measured rival is larger than the pair — the size
     * figure's rows and not just the coverage figure's, since that is the
     * figure the claim is read against.
     */
    readonly smallestOfAll: boolean;
    /** How many rows the coverage grid holds, so the claim can name its scope. */
    readonly rows: number;
} = (() => {
    // The pair by name and not simply the first row that is ours: core alone is
    // a row here too, and the claim is about the pair.
    const self = COVERAGE.rows.find((row) => row.id === PAIR_ID);
    const rivals = COVERAGE.rows.filter((row) => !row.isSelf);
    if (self === undefined || rivals.length === 0) {
        throw new Error('The coverage grid has no rows to compare');
    }
    const ceiling = Math.max(...rivals.map((row) => row.recipes));
    const tied = rivals.filter((row) => row.recipes === ceiling);
    const sizes = tied.map((row) => row.gzip);
    return {
        selfRecipes: self.recipes,
        selfKb: kilobytes(self.gzip),
        ceiling,
        atCeiling: tied.map((row) => row.name),
        ceilingFromKb: kilobytes(Math.min(...sizes)),
        ceilingToKb: kilobytes(Math.max(...sizes)),
        smallestOfAll: BUNDLES.every(
            (row) => row.isSelf || row.gzip > self.gzip,
        ),
        rows: COVERAGE.rows.length,
    };
})();

// ---- The ranked table -----------------------------------------------------

export type RankedRow = {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly isSelf: boolean;
    /** `null` for a viewer the matrix has no column for. */
    readonly recipes: number | null;
    readonly partial: number;
    readonly image: number;
    /** `null` for a viewer with no audiovisual session. */
    readonly audiovisual: number | null;
    /** `null` wherever `recipes` is, since it divides by it. */
    readonly bytesPerRecipe: number | null;
};

/**
 * Every measured viewer in one table, smallest session first: the numbers the
 * grid draws, plus the viewers the grid has no row for because the matrix has
 * no column for them or they play no time-based media.
 */
export const RANKED: readonly RankedRow[] = byImageGzip.map((viewer) => {
    const av = session(viewer, 'audiovisual');
    const column = viewer.isSelf
        ? undefined
        : pinnedEntry(viewer.id).matrixColumn;
    const recipes = viewer.isSelf
        ? catalogRecipes.filter((recipe) => recipe.support === 'supported')
              .length
        : column === undefined
          ? null
          : catalogRecipes.filter(
                (recipe) => matrixCell(column, recipe.id) === 'on',
            ).length;
    const partial =
        column === undefined
            ? 0
            : catalogRecipes.filter(
                  (recipe) => matrixCell(column, recipe.id) === 'partial',
              ).length;
    const sized = av?.gzip ?? imageSession(viewer).gzip;
    return {
        id: viewer.id,
        name: viewer.name,
        version: viewer.version,
        isSelf: viewer.isSelf,
        recipes,
        partial,
        image: imageSession(viewer).gzip,
        audiovisual: av?.gzip ?? null,
        bytesPerRecipe:
            recipes === null || recipes === 0
                ? null
                : Math.round(sized / recipes),
    };
});

// ---- What the matrix says that the grid does not ---------------------------

/**
 * How far the matrix's own Triiiceratops column runs behind the catalog. The
 * page states both rather than plotting the larger and leaving the difference
 * to be discovered.
 */
export const MATRIX_LAG: {
    readonly column: string;
    readonly credits: number;
    readonly ours: number;
    readonly readAt: string;
} = (() => {
    const column = 'Triiiceratops';
    if (!COOKBOOK_MATRIX.viewers.includes(column)) {
        throw new Error('The matrix has no Triiiceratops column');
    }
    return {
        column,
        credits: catalogRecipes.filter(
            (recipe) => matrixCell(column, recipe.id) === 'on',
        ).length,
        ours: catalogRecipes.filter((recipe) => recipe.support === 'supported')
            .length,
        readAt: COOKBOOK_MATRIX.readAt,
    };
})();

/**
 * The matrix's other columns: viewers it covers that this comparison does not
 * measure, most capable first. The disclosure names them so a reader meets the
 * fullest row in the matrix here rather than by going and finding it.
 *
 * Counted over the matrix's own recipe list, not the catalog's columns, because
 * this is a statement about the matrix.
 */
export const MATRIX_UNMEASURED: readonly {
    readonly name: string;
    readonly recipes: number;
    readonly of: number;
}[] = (() => {
    const measured = new Set(
        COMPETITORS.flatMap((competitor) =>
            competitor.matrixColumn === undefined
                ? []
                : [competitor.matrixColumn],
        ),
    );
    measured.add(MATRIX_LAG.column);
    return COOKBOOK_MATRIX.viewers
        .filter((viewer) => !measured.has(viewer))
        .map((viewer) => ({
            name: viewer,
            recipes: COOKBOOK_MATRIX.recipes.filter(
                (recipe) => recipe.marks[viewer] === 'yes',
            ).length,
            of: COOKBOOK_MATRIX.recipes.length,
        }))
        .sort((a, b) => b.recipes - a.recipes);
})();

// ---- The audiovisual code-split table -------------------------------------

export type AvRow = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    readonly image: number;
    readonly audiovisual: number;
    /** What the two figures are made of, read off the files each session fetched. */
    readonly split: string;
};

function describeSplit(viewer: MeasuredViewer): string {
    const image = imageSession(viewer);
    const av = session(viewer, 'audiovisual');
    if (av === undefined) return 'no audiovisual session';
    const deferred = viewer.lazyArtifacts?.length ?? 0;
    if (image.gzip === av.gzip) {
        const files = image.files.length === 1 ? 'one file' : 'the same files';
        return deferred > 0
            ? `${files}, plus ${deferred} chunks that exist and that no session fetches`
            : `${files} either way, with no chunk fetched per media type`;
    }
    return `${image.files.length} files for an image canvas, ${av.files.length} for an audiovisual one`;
}

export const AV_ROWS: readonly AvRow[] = byImageGzip
    .filter((viewer) => session(viewer, 'audiovisual') !== undefined)
    .map((viewer) => ({
        id: viewer.id,
        name: viewer.name,
        isSelf: viewer.isSelf,
        image: imageSession(viewer).gzip,
        audiovisual: session(viewer, 'audiovisual')!.gzip,
        split: describeSplit(viewer),
    }))
    .sort((a, b) => a.audiovisual - b.audiovisual);

/**
 * What code-splitting costs the viewer it costs most: the largest positive gap
 * between an audiovisual session and that viewer's own image session. The page
 * sets it against our own pair, whose two sessions fetch the same bytes.
 */
export const AV_PREMIUM: {
    readonly name: string;
    readonly image: number;
    readonly audiovisual: number;
    readonly extra: number;
} = (() => {
    const premiums = AV_ROWS.filter((row) => row.audiovisual > row.image)
        .map((row) => ({ ...row, extra: row.audiovisual - row.image }))
        .sort((a, b) => b.extra - a.extra);
    const costliest = premiums[0];
    if (costliest === undefined) {
        throw new Error('No viewer pays more for an audiovisual session');
    }
    return {
        name: costliest.name,
        image: costliest.image,
        audiovisual: costliest.audiovisual,
        extra: costliest.extra,
    };
})();

/**
 * The competitors with no audiovisual session at all, which get no row above.
 * Our own core row is excluded: it has no such session because the audiovisual
 * support is the plugin, which is the row beside it.
 */
export const NO_AV: readonly string[] = viewers
    .filter(
        (viewer) =>
            !viewer.isSelf && session(viewer, 'audiovisual') === undefined,
    )
    .map((viewer) => viewer.name);

/** Our own deferred chunks: measured, and in none of the figures above. */
export const LAZY_CHUNKS: readonly { name: string; gzip: number }[] = (
    viewers.find((viewer) => viewer.id === PAIR_ID)?.lazyArtifacts ?? []
).map((file) => ({ name: file.name, gzip: file.gzip }));

// ---- The disclosure -------------------------------------------------------

export type CountedFiles = {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly note?: string;
    readonly files: readonly {
        name: string;
        /**
         * Where the file came from: an absolute URL for a third-party viewer,
         * a path within this repository for a Triiiceratops row. Only the
         * former is rendered as a link.
         */
        url: string;
        external: boolean;
        gzip: number;
    }[];
};

/**
 * Exactly what each row counted: the files the image session fetched, with the
 * URL each came from. The disclosure renders the measurement itself rather than
 * a description of it.
 */
export const COUNTED: readonly CountedFiles[] = byImageGzip.map((viewer) => ({
    id: viewer.id,
    name: viewer.name,
    version: viewer.version,
    note: viewer.note,
    files: imageSession(viewer).files.map((file) => ({
        name: file.name,
        url: file.url,
        external: /^https?:\/\//.test(file.url),
        gzip: file.gzip,
    })),
}));
