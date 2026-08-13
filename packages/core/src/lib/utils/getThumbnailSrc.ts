import { getPaintingAnnotations } from './iiifParsing';
import { findImageBody, unwrapSpecificResource } from './paintingBodies';

function normalizeServiceId(serviceId: string): string {
    return serviceId.endsWith('/info.json')
        ? serviceId.slice(0, -'/info.json'.length)
        : serviceId;
}

function getThumbnailServiceUrl(service: any, size: number): string {
    let profile: unknown = '';
    try {
        profile = (service?.profile as unknown) || '';
        if (typeof profile === 'object' && profile) {
            const pObj = profile as Record<string, unknown>;
            profile =
                (pObj.value as string | undefined) ||
                (pObj.id as string | undefined) ||
                (pObj['@id'] as string | undefined) ||
                JSON.stringify(pObj);
        }
    } catch {
        // ignore
    }

    const pStr = String(profile ?? '').toLowerCase();
    const isLevel0 = pStr.includes('level0') || pStr.includes('level-0');
    const serviceId = normalizeServiceId(service?.id || service?.['@id'] || '');

    return !isLevel0 && serviceId
        ? `${serviceId}/full/${size},/0/default.jpg`
        : '';
}

export function resolveThumbnailResourceSrc(
    thumbnail: any,
    size = 200,
): string {
    if (!thumbnail) return '';

    const resource = Array.isArray(thumbnail) ? thumbnail[0] : thumbnail;
    if (!resource) return '';
    if (typeof resource === 'string') return resource;

    const services = resource?.service
        ? Array.isArray(resource.service)
            ? resource.service
            : [resource.service]
        : [];

    for (const service of services) {
        const url = getThumbnailServiceUrl(service, size);
        if (url) return url;
    }

    // v3 spells the id `id`, v2 `@id`; both are read.
    return resource?.id || resource?.['@id'] || '';
}

/**
 * Extract a thumbnail URL from a IIIF Canvas.
 *
 * Follows the same fallback chain used by ThumbnailGallery:
 *   1. The canvas's own `thumbnail` property
 *   2. First image annotation → IIIF service → {serviceId}/full/{size},/0/default.jpg
 *   3. Raw resource / body ID
 *
 * Rungs 2 and 3 are gated by the painting-body classifier
 * (`utils/paintingBodies`), because both of them end in an `<img src>`. Without
 * it, an audio canvas with no declared `thumbnail` put its MP3's URL into the
 * strip — a broken image where the reader needed to be told this is a sound
 * recording. Returning `''` is what routes the canvas to the strip's
 * no-thumbnail treatment instead.
 */
export function getThumbnailSrc(canvas: any, size = 200): string {
    let src = '';

    // 1. The canvas's declared thumbnail.
    //
    // `thumbnail` is spelled the same in IIIF v2 and v3, and
    // `resolveThumbnailResourceSrc` already accepts the array form, a bare
    // string, and a resource with an image service.
    try {
        const thumb = canvas?.thumbnail;
        if (thumb) {
            src = resolveThumbnailResourceSrc(thumb, size);
        }
    } catch {
        // ignore
    }

    if (src) return src;

    // 2. Fallback: first image annotation
    try {
        const images = getPaintingAnnotations(canvas);

        if (images && images.length > 0) {
            const annotation = images[0];

            // `findImageBody` reads the v2 `resource` spelling as well as the
            // v3 `body` one, unwraps a body array before testing for a Choice,
            // and hands back only a body that classifies as an image.
            const resource = unwrapSpecificResource(findImageBody(annotation));

            if (resource) {
                // Try IIIF image service
                const getServices = () => {
                    let s: any[] = [];
                    if (resource.service) {
                        s = Array.isArray(resource.service)
                            ? resource.service
                            : [resource.service];
                    }
                    return s;
                };

                const services = getServices();
                if (services.length > 0) {
                    const url = getThumbnailServiceUrl(services[0], size);
                    if (url) {
                        return url;
                    }
                }

                // Fallback: raw resource ID — `id` in v3, `@id` in v2.
                src = resource.id || resource['@id'] || '';
            }
        }
    } catch {
        // ignore
    }

    return src;
}
