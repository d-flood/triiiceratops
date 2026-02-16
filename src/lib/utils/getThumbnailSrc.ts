/**
 * Extract a thumbnail URL from a Manifesto canvas object.
 *
 * Follows the same fallback chain used by ThumbnailGallery:
 *   1. canvas.getThumbnail()
 *   2. First image annotation → IIIF service → {serviceId}/full/{size},/0/default.jpg
 *   3. Raw resource / body ID
 */
export function getThumbnailSrc(canvas: any, size = 200): string {
    let src = '';

    // 1. Manifesto getThumbnail
    try {
        if (canvas.getThumbnail) {
            const thumb = canvas.getThumbnail();
            if (thumb) {
                src =
                    typeof thumb === 'string'
                        ? thumb
                        : thumb.id || thumb['@id'] || '';
            }
        }
    } catch {
        // ignore
    }

    if (src) return src;

    // 2. Fallback: first image annotation
    try {
        let images = canvas.getImages?.() || [];
        if ((!images || !images.length) && canvas.getContent) {
            images = canvas.getContent();
        }

        if (images && images.length > 0) {
            const annotation = images[0];
            let resource = annotation.getResource
                ? annotation.getResource()
                : null;

            // v3 fallback: getBody
            if (!resource && annotation.getBody) {
                const body = annotation.getBody();
                const rawBody =
                    annotation.__jsonld?.body || annotation.body;
                const isChoiceBody =
                    rawBody?.type === 'Choice' ||
                    rawBody?.type === 'oa:Choice' ||
                    (body &&
                        !Array.isArray(body) &&
                        (body.type === 'Choice' ||
                            body.type === 'oa:Choice'));

                if (isChoiceBody) {
                    let items: any[] = [];
                    if (Array.isArray(body)) {
                        items = body;
                    } else if (body && (body.items || body.item)) {
                        items = body.items || body.item;
                    } else if (rawBody && (rawBody.items || rawBody.item)) {
                        items = rawBody.items || rawBody.item;
                    }
                    if (items.length > 0) {
                        resource = items[0];
                    }
                } else if (Array.isArray(body) && body.length > 0) {
                    resource = body[0];
                } else if (body) {
                    resource = body;
                }
            }

            if (
                resource &&
                !resource.id &&
                !resource.__jsonld &&
                (!resource.getServices ||
                    resource.getServices().length === 0)
            ) {
                resource = null;
            }

            if (!resource) {
                const json = annotation.__jsonld || annotation;
                if (json.body) {
                    let body = json.body;
                    if (
                        body.type === 'Choice' ||
                        body.type === 'oa:Choice'
                    ) {
                        const items = body.items || body.item || [];
                        body = items[0] || null;
                    }
                    resource = Array.isArray(body) ? body[0] : body;
                }
            }

            if (resource) {
                // Try IIIF image service
                const getServices = () => {
                    let s: any[] = [];
                    if (resource.getServices) {
                        s = resource.getServices();
                    }
                    if (!s || s.length === 0) {
                        const rJson = resource.__jsonld || resource;
                        if (rJson.service) {
                            s = Array.isArray(rJson.service)
                                ? rJson.service
                                : [rJson.service];
                        }
                    }
                    return s;
                };

                const services = getServices();
                if (services.length > 0) {
                    const service = services[0];
                    let profile: unknown = '';
                    try {
                        profile = service.getProfile
                            ? service.getProfile()
                            : (service.profile as unknown) || '';
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
                    const isLevel0 =
                        pStr.includes('level0') || pStr.includes('level-0');

                    const serviceId = service.id || service['@id'];
                    if (!isLevel0 && serviceId) {
                        return `${serviceId}/full/${size},/0/default.jpg`;
                    }
                }

                // Fallback: raw resource ID
                src =
                    resource.id ||
                    resource['@id'] ||
                    (resource.__jsonld &&
                        (resource.__jsonld.id || resource.__jsonld['@id'])) ||
                    '';

                if (!src) {
                    let rawBody: any = null;
                    if (annotation.__jsonld && annotation.__jsonld.body) {
                        rawBody = annotation.__jsonld.body;
                    } else if (annotation.body) {
                        rawBody = annotation.body;
                    }
                    if (rawBody) {
                        let bodyObj = Array.isArray(rawBody)
                            ? rawBody[0]
                            : rawBody;
                        if (
                            bodyObj.type === 'Choice' ||
                            bodyObj.type === 'oa:Choice'
                        ) {
                            const items =
                                bodyObj.items || bodyObj.item || [];
                            bodyObj = items[0] || bodyObj;
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
