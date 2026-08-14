/**
 * `placeholderCanvas` and `accompanyingCanvas`: the two still images a
 * time-based canvas can carry, resolved from raw canvas JSON.
 *
 * Both properties are full Canvas resources whose first painting body is the
 * image to show, so both are read the same way and through core's own painting
 * classifier — the same rule the claim is made with, never a second one.
 *
 * One static request each. No tiles and no deep zoom: the accompanying image is
 * a still beside a recording, not a page to study, and buying a pyramid for it
 * would put an image pipeline inside a media plugin (ADR 0017).
 */

import {
    getPaintingAnnotations,
    isImageBody,
    paintingBodyAlternatives,
} from 'triiiceratops';

/** A still to show over a stage. */
export interface CompanionImage {
    /**
     * The URL to request the still at `width` screen pixels — sized through an
     * image service where there is one, and the body's own URL where there is
     * not.
     *
     * A function rather than a string because the width is the lane's projected
     * width, which nobody knows until the renderer has laid the canvas out: the
     * still is resolved when the canvas is scanned and requested when there is
     * a lane to size it against.
     */
    urlFor(width: number): string;
    /**
     * Whether the URL is the body's own id, taken verbatim because no image
     * service shaped it.
     *
     * Decides how a video shows its placeholder: a plain URL is what the
     * `poster` attribute takes, so the browser paints and clears it on the
     * element's own schedule rather than the plugin doing it with an overlay.
     */
    readonly plain: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function positiveOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

/**
 * The base id of a service that can serve an arbitrary size, or `null`.
 *
 * Never a level0 service, which serves only the sizes it advertises: a
 * `full/{w},` request against one is a 404 where the body's own URL is an image.
 */
function sizableServiceId(service: unknown): string | null {
    const record = asRecord(service);
    if (!record) return null;

    const profile = record.profile;
    const profileText = (
        typeof profile === 'string'
            ? profile
            : (stringOrNull(asRecord(profile)?.value) ??
              stringOrNull(asRecord(profile)?.id) ??
              '')
    ).toLowerCase();
    if (profileText.includes('level0') || profileText.includes('level-0'))
        return null;

    const rawId =
        stringOrNull(record.id) ?? stringOrNull(record['@id']) ?? null;
    if (!rawId) return null;

    return rawId.endsWith('/info.json')
        ? rawId.slice(0, -'/info.json'.length)
        : rawId;
}

/** Modelled on core's `getThumbnailSrc`: `{id}/full/{width},/0/default.jpg`. */
function sizedServiceUrl(serviceId: string, width: number): string {
    return `${serviceId}/full/${Math.round(width)},/0/default.jpg`;
}

/** The first image body a companion canvas paints, or `null`. */
function firstImageBody(canvas: unknown): Record<string, unknown> | null {
    for (const annotation of getPaintingAnnotations(canvas)) {
        for (const body of paintingBodyAlternatives(annotation)) {
            if (!isImageBody(body)) continue;
            const record = asRecord(body);
            if (record) return record;
        }
    }
    return null;
}

/**
 * The image a companion Canvas paints, ready to be requested at a width.
 *
 * The width is a request, not a promise: a plain image URL is whatever size it
 * was authored at, and this release does not re-request on a zoom (v1 —
 * "sized to the visual lane's projected size at claim time").
 */
function companionImage(canvas: unknown): CompanionImage | null {
    const record = asRecord(canvas);
    if (!record) return null;

    const body = firstImageBody(record);
    if (!body) return null;

    const id = stringOrNull(body.id) ?? stringOrNull(body['@id']);
    if (!id) return null;

    const services = Array.isArray(body.service)
        ? body.service
        : body.service
          ? [body.service]
          : [];

    for (const service of services) {
        const serviceId = sizableServiceId(service);
        if (!serviceId) continue;
        // A width the caller could not measure falls back to the body's own,
        // which is the largest thing it could sensibly ask for.
        const declared = positiveOrNull(body.width) ?? 0;
        return {
            plain: false,
            urlFor: (width) => {
                const requested = width > 0 ? width : declared;
                return requested ? sizedServiceUrl(serviceId, requested) : id;
            },
        };
    }

    return { plain: true, urlFor: () => id };
}

/**
 * The canvas's `accompanyingCanvas` image — what an audio canvas shows in its
 * visual lane (Cookbook `0014-accompanyingcanvas`).
 */
export function resolveAccompanyingImage(
    canvas: unknown,
): CompanionImage | null {
    return companionImage(asRecord(canvas)?.accompanyingCanvas);
}

/**
 * The canvas's `placeholderCanvas` image — what a canvas shows *until it is
 * played* (Cookbook `0013-placeholderCanvas`).
 */
export function resolvePlaceholderImage(
    canvas: unknown,
): CompanionImage | null {
    return companionImage(asRecord(canvas)?.placeholderCanvas);
}
