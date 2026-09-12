import { isLevel0Profile } from '../renderer/sizeLadder';
import { getResourceId } from './iiifIds';
import { asArray, getPaintingAnnotations } from './iiifParsing';
import { iiifImageRequestUrl } from './iiifImageRequest';
import {
    findImageBody,
    getImageService,
    unwrapSpecificResource,
} from './paintingBodies';

/**
 * A width request against an image service, or `''` where one cannot be built.
 *
 * A level0 service answers only the derivatives it already holds, so a
 * constructed width would 404; `''` is what routes the canvas to the strip's
 * no-thumbnail treatment instead. The profile is read through
 * `sizeLadder.complianceLevel`, which knows the three spellings a compliance
 * level has in the wild — the bare version 3 token, the version 2 profile URI
 * and the version 1 fragment — where a substring search for `level0` also
 * matches it anywhere else in an id.
 */
function getThumbnailServiceUrl(service: any, size: number): string {
    const serviceId = getResourceId(service);
    if (!serviceId || isLevel0Profile(service?.profile)) return '';
    return iiifImageRequestUrl(serviceId, `${size},`);
}

export function resolveThumbnailResourceSrc(
    thumbnail: any,
    size = 200,
): string {
    if (!thumbnail) return '';

    const resource = Array.isArray(thumbnail) ? thumbnail[0] : thumbnail;
    if (!resource) return '';
    if (typeof resource === 'string') return resource;

    // The Image API service first where the resource declares one, so a
    // resource whose first service is an auth or physical-dimensions annex
    // still yields a width request. The rest are tried after it rather than
    // skipped: an Image API 1.1 service spelling its compliance level in
    // `dcterms:conformsTo` is not recognizable as an image service, but it
    // still answers a width request (`vendored/scroll.json`).
    const imageService = getImageService(resource);
    const services = asArray(resource.service);

    for (const service of imageService
        ? [imageService, ...services]
        : services) {
        const url = getThumbnailServiceUrl(service, size);
        if (url) return url;
    }

    return getResourceId(resource) ?? '';
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
 *
 * `selectedChoiceId` names a Choice alternative, and rungs 2 and 3 resolve the
 * same alternative the classifier is asked about. Without it a mixed Choice
 * resting on its video alternative classifies as unsupported and still yields
 * the image alternative's URL — the strip would show the picture while the
 * viewer showed "cannot display", over one canvas.
 */
export function getThumbnailSrc(
    canvas: any,
    size = 200,
    selectedChoiceId?: string,
): string {
    // 1. The canvas's declared thumbnail.
    //
    // `thumbnail` is spelled the same in IIIF v2 and v3, and
    // `resolveThumbnailResourceSrc` already accepts the array form, a bare
    // string, and a resource with an image service.
    const declared = resolveThumbnailResourceSrc(canvas?.thumbnail, size);
    if (declared) return declared;

    // 2 and 3. Fallback: the first painting annotation's body, resolved down
    // the same service-then-id chain as a declared thumbnail.
    //
    // `findImageBody` reads the v2 `resource` spelling as well as the v3 `body`
    // one, unwraps a body array before testing for a Choice, and hands back
    // only a body that classifies as an image.
    return resolveThumbnailResourceSrc(
        unwrapSpecificResource(
            findImageBody(getPaintingAnnotations(canvas)[0], selectedChoiceId),
        ),
        size,
    );
}
