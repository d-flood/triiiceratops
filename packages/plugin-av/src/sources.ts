/** Canvas source provider: which time-based bodies a canvas paints. */

import {
    getContainerType,
    getPaintingAnnotations,
    isImageBody,
    paintingBodyAlternatives,
} from 'triiiceratops';

import { asArray, asRecord, stringOrNull } from './iiifJson';

export type AvMediaKind = 'video' | 'audio';

export interface AvSource {
    readonly url: string;
    readonly kind: AvMediaKind;
    readonly format: string | null;
    /**
     * The picture in the canvas's rect is this body, shown by the element that
     * plays it. Not the same question as `kind`: a `Sound` body formatted
     * `video/mp4` plays through a `<video>` and paints no picture.
     */
    readonly paintsPicture: boolean;
}

export interface AvPlacement {
    readonly annotation: number;
    readonly fragment: string;
    readonly alternatives: readonly AvSource[];
    readonly spatial: boolean;
}

export interface AvCanvasScan {
    readonly canvasId: string;
    readonly width: number | null;
    readonly height: number | null;
    readonly duration: number | null;
    readonly placements: readonly AvPlacement[];
    readonly temporallyComposed: boolean;
    readonly spatiallyTargeted: boolean;
}

function usableDimension(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

/** Fragment as authored, unparsed; sequencer reads `t=` lazily. */
function targetFragment(target: unknown): string {
    if (typeof target === 'string') {
        const hash = target.indexOf('#');
        return hash === -1 ? '' : target.slice(hash + 1);
    }

    const record = asRecord(target);
    if (!record) return '';

    // v4 makes `selector` an array in publisher preference order.
    for (const selector of asArray(record.selector)) {
        const value = stringOrNull(asRecord(selector)?.value);
        if (value) return value;
    }
    return '';
}

/** `null` for non-time-based bodies; `text/vtt` beside video must not play. */
function mediaFacts(
    body: Record<string, unknown>,
): Omit<AvSource, 'url'> | null {
    const format = stringOrNull(body.format);
    const type = body.type ?? body['@type'];
    // v4 renamed `Sound` to `Audio`; v3 writes `Sound`, v2 `dctypes:Sound`.
    const sound =
        type === 'Audio' || type === 'Sound' || type === 'dctypes:Sound';
    const video = type === 'Video' || type === 'dctypes:MovingImage';

    const kind: AvMediaKind | null = format?.startsWith('audio/')
        ? 'audio'
        : format?.startsWith('video/')
          ? 'video'
          : sound
            ? 'audio'
            : video
              ? 'video'
              : null;
    if (!kind) return null;

    return {
        kind,
        format,
        paintsPicture: video || (!sound && kind === 'video'),
    };
}

function placedSources(annotation: unknown): AvSource[] {
    const sources: AvSource[] = [];

    for (const body of paintingBodyAlternatives(annotation)) {
        if (isImageBody(body)) continue;

        const record = asRecord(body);
        const url = stringOrNull(record?.id) ?? stringOrNull(record?.['@id']);
        if (!record || !url) continue;

        const facts = mediaFacts(record);
        if (!facts) continue;

        sources.push({ url, ...facts });
    }

    return sources;
}

/**
 * What this canvas paints in time-based media, or `null` if it paints none.
 *
 * Answering for EVERY canvas rather than only claimable ones is deliberate: a
 * canvas with an image body beside a video one is core's to paint and this
 * plugin's to warn about (`0489-multimedia-canvas`), so the degradation contract
 * needs the scan even where no stage will be built.
 *
 * A container declaring a type other than `Canvas` or `Timeline` (a `Scene`, or
 * an unknown kind) answers `null` whatever it paints, so it stays unclaimed for
 * the plugin that understands it: the claim takes one claimant per canvas.
 * Declining by container type, not by media, is ADR 0017's line. An untyped
 * container is a sloppy Canvas and is still scanned, so this is not an accept
 * list.
 */
export function scanCanvasForAv(canvas: unknown): AvCanvasScan | null {
    const record = asRecord(canvas);
    const canvasId =
        stringOrNull(record?.id) ?? stringOrNull(record?.['@id']) ?? null;
    if (!record || !canvasId) return null;

    const type = getContainerType(record);
    if (
        type !== 'Canvas' &&
        type !== 'Timeline' &&
        (record.type ?? record['@type']) != null
    ) {
        return null;
    }

    const placements: AvPlacement[] = [];
    getPaintingAnnotations(canvas).forEach((annotation, index) => {
        const alternatives = placedSources(annotation);
        if (alternatives.length === 0) return;

        const fragment = targetFragment(asRecord(annotation)?.target);
        placements.push({
            annotation: index,
            fragment,
            alternatives,
            spatial: /(^|&)xywh=/.test(fragment),
        });
    });

    if (placements.length === 0) return null;

    return {
        canvasId,
        width: usableDimension(record.width),
        height: usableDimension(record.height),
        duration: usableDimension(record.duration),
        placements,
        temporallyComposed: placements.length > 1,
        spatiallyTargeted: placements.some((placement) => placement.spatial),
    };
}
