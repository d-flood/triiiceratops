import {
    getChoiceAlternatives,
    getPaintingAnnotations,
    getPaintingBody,
    isChoiceBody,
} from './iiifParsing';

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
 */
export function getThumbnailSrc(canvas: any, size = 200): string {
    let src = '';

    // 1. The canvas's declared thumbnail.
    //
    // `thumbnail` is spelled the same in IIIF v2 and v3, and
    // `resolveThumbnailResourceSrc` already accepts the array form, a bare
    // string, and a resource with an image service. This branch was
    // `canvas.getThumbnail()` alone: with canvases now raw JSON that accessor
    // is gone, and every canvas declaring an explicit thumbnail would have
    // silently fallen through to its first painting annotation instead.
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

            // The raw-JSON path, and now the only one. `getPaintingBody` reads
            // the v2 `resource` spelling as well as the v3 `body` one.
            //
            // What stood above this was a library-shaped resolution followed by
            // a discard guard (`!resource.id && !resource.__jsonld && …`).
            // Neither could ever fire once annotations are raw JSON: the
            // resolution needed `annotation.getResource`/`getBody`, so
            // `resource` was always `null` when the guard was reached. The
            // guard is therefore deleted whole rather than reduced — reducing
            // it would have left `if (resource && !resource.id)`, which reads
            // only the v3 id spelling and would have discarded valid v2
            // resources carrying `@id` (SPEC → "The governing rule for the
            // whole epic").
            let resource: any = null;
            let body = getPaintingBody(annotation);
            if (body) {
                if (isChoiceBody(body)) {
                    body = getChoiceAlternatives(body)[0] || null;
                }
                resource = Array.isArray(body) ? body[0] : body;
            }

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

                if (!src) {
                    // Same v2 blindness as above, one rung further down the
                    // ladder: this re-read the annotation for a `body` only.
                    const rawBody = getPaintingBody(annotation);
                    if (rawBody) {
                        let bodyObj = Array.isArray(rawBody)
                            ? rawBody[0]
                            : rawBody;
                        if (isChoiceBody(bodyObj)) {
                            bodyObj =
                                getChoiceAlternatives(bodyObj)[0] || bodyObj;
                        }
                        src = bodyObj.id || bodyObj['@id'] || '';
                    }
                }
            }
        }
    } catch {
        // ignore
    }

    return src;
}
