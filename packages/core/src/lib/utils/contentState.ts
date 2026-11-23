/**
 * IIIF Content State resolution: a bare IIIF URI or a W3C Annotation (optionally
 * base64url-encoded) becomes the
 * `{ manifestId, canvasId?, region?, time?, choices? }` view target the viewer
 * is driven by. Never throws, never fetches (ADR 0006).
 */

import { logger } from '../logging/logger';
import { distanceToBox } from '../renderer/layoutQueries';
import type { ViewerState } from '../state/viewer.svelte';
import {
    findCanvasById,
    getCanvasId,
    getResourceId,
    resolvedId,
    sameCanvasId,
} from './iiifIds';
import {
    asArray,
    getChoiceAlternatives,
    getPaintingAnnotations,
    getPaintingBody,
    isChoiceBody,
} from './iiifParsing';
import {
    extractIiifTargetId,
    getIiifCanvasId,
    normalizeIiifTargets,
    parseIiifSelectorTime,
    parseIiifTime,
    parseIiifXywh,
    toCanvasRegion,
} from './iiifTargets';
import type { IiifTemporalFragment } from './iiifTime';

export type CanvasRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** A Choice alternative shown, keyed by the painting annotation offering it. */
export type ContentStateChoice = {
    annotation: string;
    selectedItem: { id: string; type?: string };
};

export type ContentStateTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
    /** Media time the target selected (`#t=`), the temporal peer of `region`. */
    time?: IiifTemporalFragment;
    /** The reader's non-default Choice picks, written as a `ChoiceState`. */
    choices?: ContentStateChoice[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isHttpUri(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function idOf(record: JsonRecord): string | undefined {
    const id = getResourceId(record);
    return typeof id === 'string' ? id : undefined;
}

/** The types a resource declares, in either spelling. */
function declaredTypes(record: JsonRecord): string[] {
    const declared = record.type ?? record['@type'];
    return asArray(declared).filter(
        (value): value is string => typeof value === 'string' && !!value,
    );
}

/**
 * Whether a resource declares the given IIIF type. The suffix match accepts the
 * Presentation 2 vocabulary (`sc:Manifest`) alongside the bare Presentation 3
 * name.
 */
function isType(record: JsonRecord, name: string): boolean {
    return declaredTypes(record).some(
        (value) => value === name || value.endsWith(`:${name}`),
    );
}

function decodeContentState(value: string): string {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            '=',
        );
        return atob(padded);
    } catch {
        return value;
    }
}

/**
 * The JSON document a decoded payload carries. The Cookbook publishes its
 * `iiif-content` values as JSON through `encodeURIComponent` and then base64url,
 * so a payload that is not JSON is tried again percent-decoded. Which spelling a
 * payload uses is decided by attempting the parse rather than by looking for a
 * `%`: a percent sign inside a legitimate JSON string value must not provoke a
 * second decode.
 */
function parseJsonDocument(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        // Not JSON as it stands; the percent-encoded spelling is the other form
        // the specification permits.
    }

    try {
        return JSON.parse(decodeURIComponent(text));
    } catch {
        return undefined;
    }
}

function referenceId(value: unknown): string | undefined {
    if (typeof value === 'string') return value || undefined;
    return isRecord(value) ? idOf(value) : undefined;
}

function parseChoiceState(state: unknown): ContentStateChoice[] | undefined {
    const choiceState = asArray(state).find(
        (entry): entry is JsonRecord =>
            isRecord(entry) && isType(entry, 'ChoiceState'),
    );
    const entries = asArray(choiceState?.selections).flatMap(
        (entry): ContentStateChoice[] => {
            if (!isRecord(entry)) return [];
            const annotation = referenceId(entry.annotation);
            const id = referenceId(entry.selectedItem);
            if (!annotation || !id) return [];
            const type = isRecord(entry.selectedItem)
                ? declaredTypes(entry.selectedItem)[0]
                : undefined;
            return [{ annotation, selectedItem: type ? { id, type } : { id } }];
        },
    );
    return entries.length ? entries : undefined;
}

function parseTarget(
    target: string,
): Pick<ContentStateTarget, 'canvasId' | 'region' | 'time'> {
    return {
        canvasId: getIiifCanvasId(target) || undefined,
        region: toCanvasRegion(parseIiifXywh(target)) ?? undefined,
        time: parseIiifTime(target) || undefined,
    };
}

/**
 * The view inside the manifest: the Canvas, and the region or time named on it.
 *
 * A `SpecificResource` target names those in a `selector` rather than on the
 * Canvas id's fragment, so the normalized target — which reads a selector and a
 * fragment alike — decides whenever the target is an object. A string target
 * has neither and keeps the fragment path to itself.
 */
function parseAnnotationTarget(
    target: unknown,
    targetId: string | undefined,
): Pick<ContentStateTarget, 'canvasId' | 'region' | 'time' | 'choices'> {
    const fromId = targetId ? parseTarget(targetId) : {};
    if (!isRecord(target)) return fromId;

    const [normalized] = normalizeIiifTargets(target);
    if (!normalized) return fromId;

    const time = normalized.selectors
        .map((selector) => parseIiifSelectorTime(selector))
        .find((value): value is IiifTemporalFragment => !!value);

    const choices = parseChoiceState(target.state);
    return {
        ...fromId,
        region: toCanvasRegion(normalized.xywh) ?? fromId.region,
        time: time ?? fromId.time,
        ...(choices && { choices }),
    };
}

/**
 * The Manifest a `partOf` names. An array may list the Canvas's whole
 * containment chain (a Manifest inside a Collection), so the Manifest-typed
 * entry wins. An array whose entries declare no type at all degrades to the
 * first entry — untyped `partOf` references are common in the wild — but typed
 * entries with no Manifest among them resolve to nothing: ADR 0006 makes a
 * Collection target a degrade case, and handing its URI back as the manifest id
 * would have the viewer fetch a Collection as a Manifest.
 */
function manifestIdFrom(partOf: unknown): string | undefined {
    if (typeof partOf === 'string') {
        return partOf || undefined;
    }

    if (Array.isArray(partOf)) {
        const entries = partOf.filter(isRecord);
        const manifest = entries.find((entry) => isType(entry, 'Manifest'));
        if (manifest) return idOf(manifest);

        const typed = entries.filter((entry) => declaredTypes(entry).length);
        if (typed.length) {
            const found = typed
                .map(
                    (entry) =>
                        `${declaredTypes(entry).join('/')} ${idOf(entry) ?? '(no id)'}`,
                )
                .join(', ');
            logger.warn(`content state partOf has no Manifest: ${found}`);
            return undefined;
        }

        if (entries[0]) return idOf(entries[0]);
        return partOf.find((entry) => typeof entry === 'string') as
            | string
            | undefined;
    }

    if (isRecord(partOf)) {
        return idOf(partOf);
    }

    return undefined;
}

/**
 * A content state is an Annotation even when it says so only by shape. Some
 * publishers omit `type`, and the distinction matters: an Annotation's own `id`
 * is the annotation, never the manifest, which is the failure this predicate
 * exists to prevent.
 */
function isAnnotation(document: JsonRecord): boolean {
    return (
        isType(document, 'Annotation') ||
        document.target !== undefined ||
        document.motivation !== undefined
    );
}

/**
 * A `motivation` that is missing or not `contentState` warns rather than
 * rejects: ADR 0006 asks for the most that can be honored, and a document that
 * names a Manifest is resolvable whatever it claims to motivate.
 */
function warnUnlessContentState(document: JsonRecord): void {
    const names = asArray(document.motivation);
    if (names.some((name) => name === 'contentState')) return;

    logger.warn(
        `content state ${idOf(document) ?? '(no id)'}: no contentState motivation`,
    );
}

function resolveAnnotation(document: JsonRecord): ContentStateTarget | null {
    warnUnlessContentState(document);

    const targets = asArray(document.target);
    if (targets.length > 1) {
        logger.warn(
            `content state ${idOf(document) ?? '(no id)'}: ${targets.length} targets, first used`,
        );
    }

    return resolveTarget(targets[0], document.partOf);
}

function resolveTarget(
    target: unknown,
    partOf?: unknown,
): ContentStateTarget | null {
    const targetId = extractIiifTargetId(target) ?? undefined;

    /*
     * A target that IS a Manifest is the manifest, and names no view inside it.
     * Cookbook recipe 0599's first drag source is exactly this — a Manifest
     * target with no `partOf` — and reading its id as a canvas would open a
     * manifest id as a view.
     */
    if (isRecord(target) && isType(target, 'Manifest')) {
        return targetId ? { manifestId: targetId } : null;
    }

    /*
     * A `SpecificResource` target names the Canvas through `source`, so its
     * `partOf` hangs off the source rather than the target — the shape of
     * Content State API example 5.2 and of Cookbook recipe 0306. Reading only
     * `target.partOf` finds nothing there and loses the manifest, which is the
     * one field the resolution cannot proceed without.
     */
    const manifestId =
        (isRecord(target) ? manifestIdFrom(target.partOf) : undefined) ??
        (isRecord(target) && isRecord(target.source)
            ? manifestIdFrom(target.source.partOf)
            : undefined) ??
        manifestIdFrom(partOf);

    if (!manifestId) return null;

    return {
        manifestId,
        ...parseAnnotationTarget(target, targetId),
    };
}

/**
 * A content state that is not an Annotation. A Manifest — or an untyped
 * reference to one — is its own manifest id. A document declaring some other
 * type (a Canvas, say) names its Manifest in `partOf` and contributes its own id
 * as the view target, so a region or time on that id's fragment still applies.
 */
function resolveDocument(document: JsonRecord): ContentStateTarget | null {
    const id = idOf(document);

    if (declaredTypes(document).length && !isType(document, 'Manifest')) {
        const manifestId = manifestIdFrom(document.partOf);
        if (!manifestId) return null;
        return { manifestId, ...(id ? parseTarget(id) : {}) };
    }

    if (isHttpUri(id)) {
        return { manifestId: id };
    }

    const manifestId = manifestIdFrom(document.partOf);
    return manifestId ? { manifestId } : null;
}

/**
 * Whether a dereferenced document **is** the Manifest a target names, rather
 * than a resource that merely points at one.
 *
 * Asked by `contentStateIngestion` of a document it has just fetched, to decide
 * whether the manifest is already in hand. Deliberately not "its declared id
 * equals the URL it came from": a Manifest served at `…/manifest.json` and
 * declaring `…/` as its `id` is legal and common in generated trees, and the
 * declared id is frequently not a manifest URL at all — for a `mkiiif` page it
 * is the directory, which serves the embedding HTML.
 *
 * A Collection is not one: only the fetching manifest path expands a Collection
 * into its members (ADR 0006). Nor is an Annotation or a Canvas, whose
 * Manifest is a different resource named in `partOf` and genuinely has to be
 * fetched. An untyped document with an http id is one, matching the branch
 * {@link parseContentState} resolves it through.
 */
export function isManifestDocument(value: unknown): boolean {
    if (!isRecord(value) || isAnnotation(value)) return false;

    return declaredTypes(value).length
        ? isType(value, 'Manifest')
        : isHttpUri(idOf(value));
}

export function parseContentState(value: string): ContentStateTarget | null {
    const raw = value?.trim();
    if (!raw) return null;

    if (isHttpUri(raw)) {
        return { manifestId: raw };
    }

    const document = parseJsonDocument(decodeContentState(raw));
    if (!isRecord(document)) return null;

    if (isAnnotation(document)) return resolveAnnotation(document);
    // The target alone is the compact form of a content state.
    if (isType(document, 'SpecificResource')) return resolveTarget(document);
    return resolveDocument(document);
}

// Content State requires absolute ids; a host may open relative ones.
function absolute(id: string): string {
    return isHttpUri(id) ? id : resolvedId(id) || id;
}

/**
 * Encodes a target for `iiif-content`; a manifest alone stays a bare URI. Only
 * a Choice pick moves the target into a `SpecificResource`, so a view without
 * one keeps the plain `Canvas#xywh` form.
 */
export function serializeContentState(target: ContentStateTarget): string {
    const { region, time, choices } = target;
    const manifestId = absolute(target.manifestId);
    if (!target.canvasId) return manifestId;

    const fragment = [
        region &&
            `xywh=${region.x},${region.y},${region.width},${region.height}`,
        time &&
            `t=${time.seconds}${time.endSeconds === undefined ? '' : `,${time.endSeconds}`}`,
    ]
        .filter(Boolean)
        .join('&');

    const canvas = {
        id: absolute(getIiifCanvasId(target.canvasId) ?? target.canvasId),
        type: 'Canvas',
        partOf: [{ id: manifestId, type: 'Manifest' }],
    };
    const json = JSON.stringify({
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        type: 'Annotation',
        motivation: 'contentState',
        target: choices?.length
            ? {
                  type: 'SpecificResource',
                  source: canvas,
                  state: {
                      type: 'ChoiceState',
                      selections: choices.map(
                          ({ annotation, selectedItem }) => ({
                              annotation: {
                                  id: absolute(annotation),
                                  type: 'Annotation',
                              },
                              selectedItem: {
                                  ...selectedItem,
                                  id: absolute(selectedItem.id),
                              },
                          }),
                      ),
                  },
                  ...(fragment && {
                      selector: {
                          type: 'FragmentSelector',
                          conformsTo: 'http://www.w3.org/TR/media-frags/',
                          value: fragment,
                      },
                  }),
              }
            : { ...canvas, id: canvas.id + (fragment && `#${fragment}`) },
    });

    return btoa(encodeURIComponent(json))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

type ViewSource = Pick<
    ViewerState,
    | 'manifestId'
    | 'canvasId'
    | 'canvases'
    | 'visibleCanvasIds'
    | 'containerSize'
    | 'canvasSize'
    | 'screenToCanvas'
    | 'transportChrome'
    | 'selectedChoices'
>;

function choicesOf(annotation: unknown): unknown[] {
    return asArray(getPaintingBody(annotation)).filter(isChoiceBody);
}

/** Each Choice on `canvas` showing `selectedId` when that is not its default. */
function choicesShowing(
    canvas: unknown,
    selectedId: string | undefined,
): ContentStateChoice[] {
    if (!selectedId) return [];
    return getPaintingAnnotations(canvas).flatMap((annotation) => {
        const id = getResourceId(annotation);
        if (typeof id !== 'string') return [];
        return choicesOf(annotation).flatMap((choice): ContentStateChoice[] => {
            const item = getChoiceAlternatives(choice).find(
                (alternative, index) =>
                    index > 0 && getResourceId(alternative) === selectedId,
            );
            if (!item) return [];
            return [
                {
                    annotation: id,
                    selectedItem:
                        typeof item.type === 'string'
                            ? { id: selectedId, type: item.type }
                            : { id: selectedId },
                },
            ];
        });
    });
}

/**
 * Show the alternatives a content state's `ChoiceState` names, and the
 * default everywhere else. An entry naming an annotation or item this
 * manifest lacks is ignored.
 */
export function applyChoices(
    viewer: Pick<ViewerState, 'canvases' | 'selectChoice' | 'resetChoices'>,
    entries: ContentStateChoice[] | undefined,
): void {
    viewer.resetChoices();
    if (!entries?.length) return;
    for (const canvas of viewer.canvases) {
        const canvasId = getCanvasId(canvas);
        if (!canvasId) continue;
        for (const annotation of getPaintingAnnotations(canvas)) {
            const entry = entries.find((candidate) =>
                sameCanvasId(
                    candidate.annotation,
                    getResourceId(annotation) ?? '',
                ),
            );
            if (!entry) continue;
            const item = choicesOf(annotation)
                .flatMap(getChoiceAlternatives)
                .find((alternative) =>
                    sameCanvasId(
                        entry.selectedItem.id,
                        getResourceId(alternative) ?? '',
                    ),
                );
            const itemId = item && getResourceId(item);
            if (itemId) viewer.selectChoice(canvasId, itemId);
        }
    }
}

/**
 * Returns the canvas nearest the viewport centre, the part of it on screen,
 * the playhead past 0 when that canvas has the media, and the reader's
 * non-default Choice picks on it.
 */
export function captureViewTarget(
    viewer: ViewSource,
): ContentStateTarget | null {
    const { manifestId } = viewer;
    if (!manifestId) return null;

    let target: ContentStateTarget = {
        manifestId,
        canvasId: viewer.canvasId ?? undefined,
    };
    const { width, height } = viewer.containerSize;
    if (!width || !height) return target;

    let nearest = Infinity;
    for (const canvasId of viewer.visibleCanvasIds) {
        const size = viewer.canvasSize(canvasId);
        const a = viewer.screenToCanvas({ x: 0, y: 0 }, canvasId);
        const b = viewer.screenToCanvas({ x: width, y: height }, canvasId);
        if (!size || !a || !b) continue;

        const left = Math.min(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const right = Math.max(a.x, b.x);
        const bottom = Math.max(a.y, b.y);
        // Compare in screen pixels: layout can scale canvases differently.
        const distance =
            (distanceToBox(
                { x: (left + right) / 2, y: (top + bottom) / 2 },
                { x: 0, y: 0, ...size },
            ) *
                Math.hypot(width, height)) /
            Math.hypot(right - left, bottom - top);
        if (distance >= nearest) continue;
        nearest = distance;

        const x = Math.round(Math.max(0, left));
        const y = Math.round(Math.max(0, top));
        const r = Math.round(Math.min(size.width, right));
        const s = Math.round(Math.min(size.height, bottom));
        const partial =
            x > 0 ||
            y > 0 ||
            r < Math.round(size.width) ||
            s < Math.round(size.height);

        target = {
            manifestId,
            canvasId,
            region:
                partial && r > x && s > y
                    ? { x, y, width: r - x, height: s - y }
                    : undefined,
        };
    }

    const playback = viewer.transportChrome[0]?.view();
    if (
        playback?.present &&
        playback.currentTime > 0 &&
        target.canvasId === viewer.canvasId
    )
        target.time = { seconds: playback.currentTime };

    const canvasId = target.canvasId ?? '';
    const choices = choicesShowing(
        findCanvasById(viewer.canvases, canvasId),
        viewer.selectedChoices.get(canvasId),
    );
    if (choices.length) target.choices = choices;

    return target;
}

export const BROWSER_CONTENT_STATE = {
    parse: parseContentState,
    serialize: serializeContentState,
    capture: captureViewTarget,
};
