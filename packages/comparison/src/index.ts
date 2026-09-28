/**
 * The bundle-size comparison's data: the pinned viewer list and the committed
 * output of the last measurement.
 */

// The import attribute is required, not decorative: consumers reach this module
// as TypeScript source, and one of them — Playwright's own loader — hands it to
// Node's ESM loader, which refuses a JSON module without it.
import matrix from './matrix.json' with { type: 'json' };
import measured from './measured.json' with { type: 'json' };

export type { Competitor, SessionKind } from './competitors';
export { COMPETITORS, SESSION_MANIFESTS } from './competitors';

import type { SessionKind } from './competitors';

/** Bytes on the wire at each compression level the comparison quotes. */
export interface Measurement {
    raw: number;
    /** gzip at the level recorded in `MeasuredComparison.compression`. */
    gzip: number;
    /** Brotli at the quality recorded in `MeasuredComparison.compression`. */
    brotli: number;
}

/** One file a session fetched, or one artifact a session deliberately did not. */
export interface MeasuredFile extends Measurement {
    /**
     * Where the file came from: the absolute URL for a third-party viewer, a
     * repository-relative path for a Triiiceratops row.
     */
    url: string;
    name: string;
}

/** What one viewer's session of one kind transferred, and out of which files. */
export interface MeasuredSession extends Measurement {
    kind: SessionKind;
    /** Every counted file, ordered by URL so a re-measure diffs cleanly. */
    files: MeasuredFile[];
}

export interface MeasuredViewer {
    /** Matches a `Competitor.id`. */
    id: string;
    name: string;
    version: string;
    /** True for a Triiiceratops row, so a chart can mark its own bar. */
    isSelf: boolean;
    sessions: MeasuredSession[];
    lazyArtifacts?: MeasuredFile[];
    note?: string;
}

export interface MeasuredComparison {
    /** `YYYY-MM-DD`. */
    measuredAt: string;
    compression: { gzipLevel: number; brotliQuality: number };
    sessionManifests: Record<SessionKind, string>;
    viewers: MeasuredViewer[];
}

/** Committed output of `pnpm --filter @triiiceratops/comparison measure`. Regenerated on demand only. */
export const MEASURED_COMPARISON = measured as MeasuredComparison;

export type MatrixMark = 'yes' | 'partial' | 'no';

export interface MatrixRecipe {
    /** Joins to a `CookbookRecipe.id`. */
    id: string;
    name: string;
    /** Keyed by the matrix's own column heading — see `Competitor.matrixColumn`. */
    marks: Record<string, MatrixMark>;
}

export interface CookbookMatrix {
    /** `YYYY-MM-DD`. */
    readAt: string;
    source: string;
    viewers: string[];
    recipes: MatrixRecipe[];
}

/**
 * Committed output of `pnpm --filter @triiiceratops/comparison matrix`, regenerated
 * on demand only. Covers more viewers than the comparison measures; consumers join
 * on the recipe slugs they know.
 */
export const COOKBOOK_MATRIX = matrix as CookbookMatrix;
