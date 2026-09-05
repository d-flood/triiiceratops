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
    MEASURED_COMPARISON,
    type Competitor,
    type MeasuredSession,
    type MeasuredViewer,
    type SessionKind,
} from '@triiiceratops/comparison';
import { COOKBOOK_RECIPES, type CookbookRecipe } from '@triiiceratops/cookbook';

const { compression, measuredAt, sessionManifests, viewers } =
    MEASURED_COMPARISON;

export const MEASURED_AT = measuredAt;

/**
 * The measurement date as the page sets it. Formatted in UTC from the committed
 * `YYYY-MM-DD` so the string does not change with the machine that builds it.
 */
export const MEASURED_ON = new Date(`${measuredAt}T00:00:00Z`).toLocaleDateString(
    'en-GB',
    { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' },
);
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
 * What the capability axis counts, from the recipe catalog.
 *
 * `withPlugin` is the figure plotted: both axes have to describe the same
 * viewer, and the size axis is the audiovisual session, which is the pair.
 */
export const RECIPES: {
    readonly total: number;
    readonly audiovisual: number;
    readonly withPlugin: number;
    readonly core: number;
    readonly pluginOnly: number;
    readonly partial: readonly CookbookRecipe[];
} = {
    total: COOKBOOK_RECIPES.length,
    audiovisual: COOKBOOK_RECIPES.filter((r) => r.group === 'audiovisual')
        .length,
    withPlugin: supported.length,
    core: supported.filter((r) => !r.requiresPluginAv).length,
    pluginOnly: supported.filter((r) => r.requiresPluginAv).length,
    partial: COOKBOOK_RECIPES.filter((r) => r.support === 'partial'),
};

// ---- The size bars --------------------------------------------------------

export type SizeBar = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    readonly gzip: number;
    /** The bar's length, as a percentage of the largest row. */
    readonly widthPercent: number;
};

const byImageGzip = [...viewers].sort(
    (a, b) => imageSession(a).gzip - imageSession(b).gzip,
);

const largestImageGzip = Math.max(
    ...viewers.map((viewer) => imageSession(viewer).gzip),
);

export const SIZE_BARS: readonly SizeBar[] = byImageGzip.map((viewer) => ({
    id: viewer.id,
    name: viewer.name,
    isSelf: viewer.isSelf,
    gzip: imageSession(viewer).gzip,
    widthPercent:
        Math.round((imageSession(viewer).gzip / largestImageGzip) * 1000) / 10,
}));

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
 * margin `pnpm size:check:pair` fails the build for losing.
 */
export const HEADROOM: { readonly competitor: string; readonly bytes: number } =
    (() => {
        const at = SIZE_BARS.findIndex((bar) => bar.id === PAIR_ID);
        const next = SIZE_BARS[at + 1];
        if (next === undefined) {
            throw new Error('The audiovisual pair is the largest row');
        }
        return {
            competitor: next.name,
            bytes: next.gzip - SIZE_BARS[at].gzip,
        };
    })();

// ---- The scatter ----------------------------------------------------------

/**
 * The plot's frame, in `viewBox` units. The left and bottom margins hold the
 * tick labels and the axis titles; the right one holds the widest point label.
 */
const PLOT = { left: 70, right: 650, top: 30, bottom: 340 } as const;
const Y_TICK_STEP_KB = 200;
const X_TICK_STEP = 20;
/** Where a point's label sits relative to its mark. */
const LABEL_DX = 11;
const LABEL_DY = 4;

export type ScatterPoint = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    readonly recipes: number;
    readonly gzip: number;
    readonly x: number;
    readonly y: number;
    readonly labelX: number;
    readonly labelY: number;
};

export type Tick = { readonly value: number; readonly at: number };

/**
 * How many recipes a measured viewer is plotted at, or `undefined` for one the
 * matrix has no column for — which gets no point rather than a point at nought.
 *
 * A Triiiceratops row is counted from the recipe catalog and every other row
 * from the pinned matrix reading, so our own figure cannot drift from the
 * catalog it is published from.
 */
function recipesFor(viewer: MeasuredViewer): number | undefined {
    if (viewer.id === PAIR_ID) return RECIPES.withPlugin;
    if (viewer.isSelf) return undefined;
    return pinnedEntry(viewer.id).matrixRecipes?.supported;
}

const plotted = viewers
    .map((viewer) => ({
        viewer,
        recipes: recipesFor(viewer),
        audiovisual: session(viewer, 'audiovisual'),
    }))
    .filter(
        (
            entry,
        ): entry is {
            viewer: MeasuredViewer;
            recipes: number;
            audiovisual: MeasuredSession;
        } => entry.recipes !== undefined && entry.audiovisual !== undefined,
    );

const maxKb = Math.max(...plotted.map((e) => e.audiovisual.gzip / 1000));
const yMaxKb = Math.ceil(maxKb / 100) * 100;

function xAt(recipes: number): number {
    return (
        PLOT.left + (recipes / RECIPES.total) * (PLOT.right - PLOT.left)
    );
}

function yAt(kb: number): number {
    return PLOT.bottom - (kb / yMaxKb) * (PLOT.bottom - PLOT.top);
}

function ticks(max: number, step: number, place: (v: number) => number): Tick[] {
    const out: Tick[] = [];
    for (let value = 0; value <= max; value += step) {
        out.push({ value, at: Math.round(place(value) * 10) / 10 });
    }
    return out;
}

/** Everything the scatter's markup needs, in `viewBox` units. */
export const SCATTER: {
    readonly width: number;
    readonly height: number;
    readonly plot: typeof PLOT;
    /** The top of the y axis, in KB. Rounded up past the largest viewer. */
    readonly yMaxKb: number;
    readonly xTicks: readonly Tick[];
    readonly yTicks: readonly Tick[];
    readonly points: readonly ScatterPoint[];
} = {
    width: 680,
    height: 400,
    plot: PLOT,
    yMaxKb,
    xTicks: ticks(RECIPES.total, X_TICK_STEP, xAt),
    yTicks: ticks(yMaxKb, Y_TICK_STEP_KB, yAt),
    points: plotted
        .map(({ viewer, recipes, audiovisual }) => {
            const x = Math.round(xAt(recipes) * 10) / 10;
            const y = Math.round(yAt(audiovisual.gzip / 1000) * 10) / 10;
            return {
                id: viewer.id,
                name: viewer.name,
                isSelf: viewer.isSelf,
                recipes,
                gzip: audiovisual.gzip,
                x,
                y,
                labelX: x + LABEL_DX,
                labelY: y + LABEL_DY,
            };
        })
        .sort((a, b) => a.y - b.y),
};

/** The capability table under the scatter: the same figures, readable. */
export type CapabilityRow = {
    readonly id: string;
    readonly name: string;
    readonly isSelf: boolean;
    readonly recipes: number;
    readonly partial: number;
    readonly gzip: number;
    readonly bytesPerRecipe: number;
};

export const CAPABILITY_ROWS: readonly CapabilityRow[] = plotted
    .map(({ viewer, recipes, audiovisual }) => ({
        id: viewer.id,
        name: viewer.name,
        isSelf: viewer.isSelf,
        recipes,
        partial:
            viewer.id === PAIR_ID
                ? RECIPES.partial.length
                : (pinnedEntry(viewer.id).matrixRecipes?.partial ?? 0),
        gzip: audiovisual.gzip,
        bytesPerRecipe: Math.round(audiovisual.gzip / recipes),
    }))
    .sort((a, b) => a.gzip - b.gzip);

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

/**
 * A catalog reason as this page sets it: the catalog's own prose, with its
 * Markdown code ticks dropped and its `docs/<page>.md` reference named as the
 * guide it points at, since that guide is not a page of this site.
 */
export function reasonText(reason: string): string {
    return reason
        .replace(/`docs\/([\w-]+)\.md`/g, 'the $1 guide')
        .replace(/`/g, '');
}

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
