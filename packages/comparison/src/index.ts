/**
 * The bundle-size comparison's data: the pinned viewer list and the committed
 * output of the last measurement. Consumers read both through this entrypoint.
 *
 * Nothing here is published. The data lives in its own package rather than being
 * exported from the viewer core for the same reason the recipe catalog does — see
 * CONTEXT.md, "Shipped surface".
 */

// The import attribute is required, not decorative: consumers reach this module
// as TypeScript source, and one of them — Playwright's own loader — hands it to
// Node's ESM loader, which refuses a JSON module without it.
import measured from './measured.json' with { type: 'json' };

export type { Competitor, SessionKind } from './competitors';
export { COMPETITORS, SESSION_MANIFESTS } from './competitors';

import type { SessionKind } from './competitors';

/** Bytes on the wire at each compression level the comparison quotes. */
export interface Measurement {
    /** Uncompressed bytes. */
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
    /** The file's own name, for a table that cannot show a whole URL. */
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
    /** Artifacts that exist beside the entry files but that no session fetched. */
    lazyArtifacts?: MeasuredFile[];
    /** `Competitor.note` — why these artifacts are what a page loads. */
    note?: string;
}

export interface MeasuredComparison {
    /** The date of the measurement, `YYYY-MM-DD`, so a page can state it. */
    measuredAt: string;
    /** The compression settings every figure was produced with. */
    compression: { gzipLevel: number; brotliQuality: number };
    /** The manifest each session kind was driven against. */
    sessionManifests: Record<SessionKind, string>;
    viewers: MeasuredViewer[];
}

/**
 * The committed output of `pnpm --filter @triiiceratops/comparison measure`.
 * Regenerated on demand only: competitor versions move independently, and a
 * scheduled re-measurement would rewrite a published claim unreviewed.
 */
export const MEASURED_COMPARISON = measured as MeasuredComparison;
