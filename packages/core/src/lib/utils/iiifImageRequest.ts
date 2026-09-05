/**
 * How a IIIF Image API request URL is spelled — in one place.
 *
 * The URL is the whole contract with the image server, so it is spelled in one
 * place: a drifting `/0/` or `default.jpg` is a silent 404.
 *
 * A leaf module: it imports nothing, so both the renderer and the utils layer
 * can reach it without either reaching the other.
 */

/**
 * A service id reduced to the request base.
 *
 * A manifest may name the service by its `info.json` — that is the document's
 * id, not the request prefix — and every request path below is relative to the
 * prefix.
 */
export function normalizeServiceId(serviceId: string): string {
    return serviceId.endsWith('/info.json')
        ? serviceId.slice(0, -'/info.json'.length)
        : serviceId;
}

/**
 * `{service}/{region}/{size}/{rotation}/{quality}.{format}`.
 *
 * The rotation is always `0`: nothing in the viewer asks a server to rotate,
 * because a rotated request is a second derivative to generate and cache for a
 * transform the canvas applies for free.
 *
 * `quality` is `default` in every happy path. The only caller that passes
 * anything else is the one building the `native` fallback a version 2 request
 * carries, which is reached only after `default` has failed.
 */
export function iiifImageRequestUrl(
    serviceId: string,
    size: string,
    quality = 'default',
    format = 'jpg',
    region = 'full',
): string {
    return `${normalizeServiceId(serviceId)}/${region}/${size}/0/${quality}.${format}`;
}

/**
 * The `size` parameter for a whole image at a given width.
 *
 * `whole` takes the canonical whole-image spelling — `max` in version 3, `full`
 * in version 2 — and everything else takes the width-only form.
 *
 * The distinction is not cosmetic at either end. It is the file a level0
 * derivative generator writes for the original, where `1200,` is what it writes
 * for the entries in `sizes[]`. And asking a 400 px wide service for `512,` is
 * not a large picture, it is a **400**: Image API 3.0 requires the `^`
 * upscaling prefix for any size beyond the region's extent, and 2.1 forbids
 * upscaling outright, so a small canvas would burn its attempts on a URL the
 * server refuses.
 */
export function iiifSizeParameter(
    width: number,
    whole: boolean,
    version: 2 | 3,
): string {
    return whole ? (version === 3 ? 'max' : 'full') : `${width},`;
}
