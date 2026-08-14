/**
 * Whether a painting annotation places something core can render, and therefore
 * whether its canvas gets the **unsupported presentation** (CONTEXT.md; ADR
 * 0017).
 *
 * Core is an image viewer. Without this, a `Video` or `Sound` body is
 * indistinguishable from an image resource with an unusual id: the media URL is
 * handed to the tile pipeline, fetched with `new Image()`, and recorded in the
 * negative cache when it fails to decode. The distinction is drawn here and
 * nowhere else — canvas→source resolution, the planner's descriptors, and the
 * thumbnail fallback all ask this module rather than re-deriving it.
 */

import { getCanvasId, getResourceId } from './iiifIds';
import {
    getChoiceAlternatives,
    getPaintingAnnotations,
    getPaintingBody,
    isChoiceBody,
} from './iiifParsing';

function isIiifImageProfile(profile: unknown): boolean {
    if (typeof profile === 'string') {
        return (
            /^https?:\/\/iiif\.io\/api\/image\//.test(profile) ||
            profile === 'level0' ||
            profile === 'level1' ||
            profile === 'level2'
        );
    }

    if (Array.isArray(profile)) {
        return profile.some((item) => isIiifImageProfile(item));
    }

    return false;
}

/**
 * The Image API service on a resource, or `null`.
 *
 * Lives here rather than beside its consumer in `resolveCanvasImage` because
 * carrying one is one of the three ways a body qualifies as an image, and the
 * classifier must not be able to disagree with the resolver about what an image
 * service is.
 *
 * @internal Not exported from any package entry point.
 */
export function getImageService(resource: any): any | null {
    let services: any[] = [];

    if (resource?.service) {
        services = Array.isArray(resource.service)
            ? resource.service
            : [resource.service];
    }

    if (!services.length) {
        return null;
    }

    return (
        services.find((item: any) => {
            // v3 spells the service type `type`, v2 `@type`; `profile` is
            // spelled the same in both.
            const type = item?.type || item?.['@type'] || '';
            const profile = item?.profile || '';

            return (
                type === 'ImageService1' ||
                type === 'ImageService2' ||
                type === 'ImageService3' ||
                isIiifImageProfile(profile)
            );
        }) || null
    );
}

/** A `SpecificResource` wrapper's `source`, or the value unchanged. */
export function unwrapSpecificResource(resource: any): any {
    return resource?.type === 'SpecificResource' && resource?.source
        ? resource.source
        : resource;
}

/**
 * Whether one painting body is an **image body** — something core's tile
 * pyramid, size ladder, or static `<img>` can paint. Everything else is a
 * non-image body: time-based media, a text body, a 3D model, whatever a future
 * medium turns out to be.
 *
 * **The rule, and it is deliberately generous.** A body is an image if its type
 * says so (`Image` in v3, `dctypes:Image` in v2), *or* its `format` is an image
 * media type, *or* it carries an Image API service — any one of the three. Real
 * manifests omit any given one of them: a v2 resource may carry only `@type`, a
 * pre-release-v3 body only `format`, and a bare `{id, service}` neither.
 * Requiring agreement would stop painting images the viewer paints today, which
 * is a far worse failure than the one this function exists to prevent.
 *
 * It really is an OR and not a vote: a body declaring a non-image type and an
 * image `format` is painted. That combination is nonsense no manifest writes,
 * and the alternative is a list of the types that are *not* images — which is
 * core learning what "AV" is, the AV-typed seam ADR 0017 rejects.
 * `0014-accompanyingcanvas` is the real disagreement in the corpus, and it needs
 * no tie-break: it types its body `Sound` and formats it `video/mp4`, and
 * neither of those is an image whichever one you believe.
 *
 * **A body declaring neither a type nor a format is an image**, and that last
 * rung is a deliberate widening of the rule as stated. Being wrong about a body
 * that says nothing about itself is a choice between two failures, and they are
 * not symmetrical: calling it non-image shows an unsupported placeholder over a
 * manifest whose pictures would have loaded, while calling it an image is the
 * assumption this viewer has always made and the only reason
 * `resolveCanvasImage`'s service-id heuristic has anything to run on. Every body
 * this rung is reached for is untyped and unformatted — there is nothing in it
 * that says "video", because a body that says so is caught two lines above.
 *
 * A service the rungs above did not recognise is deliberately not held against
 * it. An auth service, a `physdim` annex, or an Image API 1.1 service whose
 * `profile` is a compliance URL rather than a `iiif.io/api/image/` one all fail
 * {@link getImageService} while saying nothing whatever about the medium, and a
 * v2 body carrying one and no `@type` is an ordinary shape that painted before
 * this classifier existed.
 *
 * A `Choice` is not classified — it is a set of alternatives, and each is
 * classified on its own after unwrapping (see {@link paintingBodyAlternatives}).
 * Handed one anyway it answers `false`: it declares a type, and that type is not
 * an image.
 */
export function isImageBody(body: unknown): boolean {
    const resource = unwrapSpecificResource(body);
    if (!resource || typeof resource !== 'object') return false;

    const entry = resource as Record<string, unknown>;
    const type = entry.type ?? entry['@type'];
    if (type === 'Image' || type === 'dctypes:Image') return true;

    const format = entry.format;
    if (typeof format === 'string' && format.startsWith('image/')) return true;

    if (getImageService(resource) !== null) return true;

    return type === undefined && format === undefined;
}

/**
 * Every resource one painting annotation could place, flattened.
 *
 * **The body array is unwrapped BEFORE the Choice test**, and that ordering is
 * the whole of it. A v3 painting annotation may carry several bodies — the real
 * shape is `body: [Choice(videos), Text(vtt)]`, which
 * `vendored/lunchroom-manners` has carried since the corpus was vendored — and
 * testing for a Choice first sees an array, answers "not a Choice", and then
 * takes `body[0]`: the Choice object itself, which has no id and no service and
 * so silently resolves to nothing. Fixing that ordering without classification
 * would be worse than the bug, because the alternative it then resolves is an
 * MP4 (user story 40).
 *
 * A Choice contributes ALL its alternatives here, not the selected one: this
 * answers "what could this annotation place", which is the question the
 * unsupported presentation is decided on. Selection is `resolveCanvasImage`'s,
 * and it is a different question.
 */
export function paintingBodyAlternatives(annotation: unknown): unknown[] {
    const body = getPaintingBody(annotation);
    if (!body) return [];

    const entries = Array.isArray(body) ? body : [body];

    return entries.flatMap((entry) =>
        isChoiceBody(entry) ? getChoiceAlternatives(entry) : [entry],
    );
}

/**
 * Whether this canvas gets the **unsupported presentation**: it paints
 * something, and core can render none of it (CONTEXT.md).
 *
 * The rule in one place — the descriptor builder and the thumbnail strip both
 * ask it, and they must never disagree about which canvases are honest about
 * being undisplayable.
 *
 * Three answers collapse into two, and the collapse is the point. A canvas that
 * paints nothing at all (Cookbook recipe 0283, an IxIF element) is `false`: it
 * has nothing to be unsupported about, and the viewer has always dropped it. A
 * canvas with even one image body is `false` too, however much non-image
 * content sits beside it — that canvas paints its images and ignores the rest
 * silently (`0489-multimedia-canvas` is the corpus's example, an Image body
 * beside a Video one and three text ones).
 *
 * Decided over the canvas's painting bodies **as selected**, which for a Choice
 * is one alternative and not the set. Asking about the set instead deletes a
 * canvas outright: {@link findImageBody} takes only the selected alternative,
 * so a mixed Choice resting on its non-image alternative resolves to no image,
 * while a classifier that saw the image alternative beside it answered `false`
 * — no images and not unsupported either, which is the descriptor builder's
 * signal for a broken annotation to drop. The reader lost the canvas, its rect,
 * its place in navigation and any way back to the image alternative. Selection
 * and classification have to be made over the same body.
 *
 * `selectedChoiceId` names a Choice alternative; anything else, including
 * nothing, means the first one — the IIIF default, and the same default
 * resolution follows.
 *
 * Nothing here reads a target: whether core can display a canvas is a property
 * of the canvas.
 */
export function isUnsupportedCanvas(
    canvas: unknown,
    selectedChoiceId?: string,
): boolean {
    let paintsSomething = false;

    for (const annotation of getPaintingAnnotations(canvas)) {
        for (const body of selectedPaintingBodies(
            annotation,
            selectedChoiceId,
        )) {
            if (isImageBody(body)) return false;
            paintsSomething = true;
        }
    }

    return paintsSomething;
}

/**
 * A reader's Choice selections, in either shape callers already hold: the
 * viewer state object itself, or the bare lookup a plugin entry point is handed.
 */
export type ChoiceSelection =
    | { getSelectedChoice(canvasId: string): string | undefined }
    | ((canvasId: string) => string | undefined);

/** The selection recorded for `canvasId`, or `undefined` for the IIIF default. */
function selectedChoiceFor(
    selection: ChoiceSelection | undefined,
    canvasId: string,
): string | undefined {
    return typeof selection === 'function'
        ? selection(canvasId)
        : selection?.getSelectedChoice(canvasId);
}

/**
 * {@link isUnsupportedCanvas} against a whole canvas's selection state, which is
 * how every caller in the tree actually asks it.
 *
 * The classification rule and the selection lookup belong together. Written out
 * per site, the two drift apart the moment one site learns about selection and
 * another does not — and a viewer showing the unsupported presentation beside a
 * strip showing the image alternative is exactly that drift.
 */
export function isUnsupportedCanvasFor(
    selection: ChoiceSelection | undefined,
    canvas: unknown,
): boolean {
    return isUnsupportedCanvas(
        canvas,
        selectedChoiceFor(selection, getCanvasId(canvas) ?? ''),
    );
}

/**
 * The first image body this annotation would place, or `null` if it places
 * none.
 *
 * The image pipeline's entry point: everything past it — the heuristic service
 * id, the source descriptors, the static loader, the negative cache, the
 * thumbnail fallback — is reached only through a body this function returned, so
 * a non-image body cannot get there.
 *
 * Returns the body **as authored**, `SpecificResource` wrapper and all, because
 * the wrapper carries the Image API selector its caller still has to read.
 *
 * `selectedChoiceId` names a Choice alternative; anything else, including
 * nothing, takes the first, which is the IIIF default. Where the chosen
 * alternative is not an image the annotation places no image, and the *other*
 * alternatives are deliberately not searched: a Choice is the reader's pick
 * between equivalents, not a fallback chain to hunt through for something
 * paintable.
 */
export function findImageBody(
    annotation: unknown,
    selectedChoiceId?: string,
): unknown | null {
    for (const body of selectedPaintingBodies(annotation, selectedChoiceId)) {
        if (isImageBody(body)) return body;
    }

    return null;
}

/**
 * The resources one painting annotation actually places, each Choice collapsed
 * to its selected alternative.
 *
 * The counterpart to {@link paintingBodyAlternatives}: that one answers "what
 * COULD this annotation place", this one "what does it place right now". The
 * body array is unwrapped before the Choice test here for the same reason it is
 * there.
 */
function selectedPaintingBodies(
    annotation: unknown,
    selectedChoiceId: string | undefined,
): unknown[] {
    const body = getPaintingBody(annotation);
    if (!body) return [];

    const entries = Array.isArray(body) ? body : [body];

    return entries
        .map((entry) =>
            isChoiceBody(entry)
                ? chooseAlternative(entry, selectedChoiceId)
                : entry,
        )
        .filter((entry) => entry !== null && entry !== undefined);
}

function chooseAlternative(
    choice: unknown,
    selectedChoiceId: string | undefined,
): unknown {
    const alternatives = getChoiceAlternatives(choice);

    const selected = selectedChoiceId
        ? alternatives.find(
              (alternative) => getResourceId(alternative) === selectedChoiceId,
          )
        : null;

    return selected || alternatives[0] || null;
}
