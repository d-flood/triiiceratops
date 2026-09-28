/** Size-and-capability figures, computed from committed data at build time. */

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

export const MATRIX_URL = 'https://iiif.io/api/cookbook/recipe/matrix/';

const pinned = new Map<string, Competitor>(COMPETITORS.map((c) => [c.id, c]));

function pinnedEntry(id: string): Competitor {
    const competitor = pinned.get(id);
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

function imageSession(viewer: MeasuredViewer): MeasuredSession {
    const found = session(viewer, 'image');
    if (found === undefined) {
        throw new Error(`${viewer.id} has no image session`);
    }
    return found;
}

function sizedSession(viewer: MeasuredViewer): MeasuredSession {
    return session(viewer, 'audiovisual') ?? imageSession(viewer);
}

export function kilobytes(bytes: number): string {
    return (bytes / 1000).toFixed(1);
}

export function grouped(bytes: number): string {
    return bytes.toLocaleString('en-US');
}

// ---- The capability axis --------------------------------------------------

const supported = COOKBOOK_RECIPES.filter((r) => r.support === 'supported');

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

/** One cell of the coverage grid. */
export type CoverageCell = 'on' | 'partial' | 'off';

const marksByRecipe = new Map(
    COOKBOOK_MATRIX.recipes.map((recipe) => [recipe.id, recipe.marks]),
);

function matrixCell(column: string, recipeId: string): CoverageCell {
    const mark = marksByRecipe.get(recipeId)?.[column];
    if (mark === undefined) return 'off';
    return mark === 'yes' ? 'on' : mark === 'partial' ? 'partial' : 'off';
}

const catalogRecipes = [...COOKBOOK_RECIPES].sort((a, b) =>
    a.id.localeCompare(b.id),
);

export type CoverageRow = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    readonly recipes: number;
    readonly partial: number;
    readonly gzip: number;
    readonly source: 'catalog' | 'matrix';
    readonly sessionKind: SessionKind;
    readonly cells: readonly CoverageCell[];
};

const CELL_ORDER: Record<CoverageCell, number> = { on: 0, partial: 1, off: 2 };

function packed(cells: CoverageCell[]): CoverageCell[] {
    return [...cells].sort((a, b) => CELL_ORDER[a] - CELL_ORDER[b]);
}

function cellsFor(
    viewer: MeasuredViewer,
): { source: 'catalog' | 'matrix'; cells: CoverageCell[] } | undefined {
    if (viewer.isSelf) {
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

export const COVERAGE: {
    readonly total: number;
    readonly rows: readonly CoverageRow[];
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
    readonly gzip: number;
    readonly sizePercent: number;
    readonly covered: boolean;
};

const coveredIds = new Set(rows.map((row) => row.id));
const largestSized = Math.max(
    ...viewers.map((viewer) => sizedSession(viewer).gzip),
);

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

export const SIZE_ONLY: readonly string[] = BUNDLES.filter(
    (row) => !row.covered,
).map((row) => row.name);

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

export const LEAD: {
    readonly selfRecipes: number;
    readonly selfKb: string;
    readonly ceiling: number;
    readonly atCeiling: readonly string[];
    readonly ceilingFromKb: string;
    readonly ceilingToKb: string;
    readonly smallestOfAll: boolean;
    readonly rows: number;
} = (() => {
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
    readonly recipes: number | null;
    readonly partial: number;
    readonly image: number;
    readonly audiovisual: number | null;
    readonly bytesPerRecipe: number | null;
};

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

export const NO_AV: readonly string[] = viewers
    .filter(
        (viewer) =>
            !viewer.isSelf && session(viewer, 'audiovisual') === undefined,
    )
    .map((viewer) => viewer.name);

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
        url: string;
        external: boolean;
        gzip: number;
    }[];
};

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
