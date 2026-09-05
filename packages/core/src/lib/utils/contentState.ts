/**
 * IIIF Content State resolution: a bare IIIF URI or a W3C Annotation (optionally
 * base64url-encoded) becomes the `{ manifestId, canvasId?, region?, time? }`
 * view target the viewer is driven by. Never throws, never fetches (ADR 0006).
 */

import { logger } from '../logging/logger';
import {
    extractIiifTargetId,
    getIiifCanvasId,
    parseIiifTime,
    parseIiifXywh,
} from './iiifTargets';
import type { IiifTemporalFragment } from './iiifTime';

export type CanvasRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ContentStateTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
    /** Media time the target selected (`#t=`), the temporal peer of `region`. */
    time?: IiifTemporalFragment;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isHttpUri(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function idOf(record: JsonRecord): string | undefined {
    const id = record.id ?? record['@id'];
    return typeof id === 'string' && id ? id : undefined;
}

/** The types a resource declares, in either spelling. */
function declaredTypes(record: JsonRecord): string[] {
    const declared = record.type ?? record['@type'];
    const names = Array.isArray(declared) ? declared : [declared];
    return names.filter(
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

function parseTarget(
    target: string,
): Pick<ContentStateTarget, 'canvasId' | 'region' | 'time'> {
    const xywh = parseIiifXywh(target);

    return {
        canvasId: getIiifCanvasId(target) || undefined,
        region: xywh
            ? {
                  x: xywh[0],
                  y: xywh[1],
                  width: xywh[2],
                  height: xywh[3],
              }
            : undefined,
        time: parseIiifTime(target) || undefined,
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
            logger.warn(
                `Content state \`partOf\` names no Manifest; found ${found}. ` +
                    'Nothing resolvable as a manifest.',
            );
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
    const motivation = document.motivation;
    const names = Array.isArray(motivation) ? motivation : [motivation];
    if (names.some((name) => name === 'contentState')) return;

    logger.warn(
        `Content state ${idOf(document) ?? '(no id)'} does not declare ` +
            '`motivation: contentState`. Resolving it anyway.',
    );
}

function resolveAnnotation(document: JsonRecord): ContentStateTarget | null {
    warnUnlessContentState(document);

    const targets = Array.isArray(document.target)
        ? document.target
        : [document.target];
    if (targets.length > 1) {
        logger.warn(
            `Content state ${idOf(document) ?? '(no id)'} names ${targets.length} ` +
                'targets. Only the first is honored; the rest are dropped.',
        );
    }

    const target = targets[0];
    const targetId = extractIiifTargetId(target) ?? undefined;
    const manifestId =
        (isRecord(target) ? manifestIdFrom(target.partOf) : undefined) ??
        manifestIdFrom(document.partOf);

    if (!manifestId) return null;

    return {
        manifestId,
        ...(targetId ? parseTarget(targetId) : {}),
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

export function parseContentState(value: string): ContentStateTarget | null {
    const raw = value?.trim();
    if (!raw) return null;

    if (isHttpUri(raw)) {
        return { manifestId: raw };
    }

    let document: unknown;
    try {
        document = JSON.parse(decodeContentState(raw));
    } catch {
        return null;
    }

    if (!isRecord(document)) return null;

    return isAnnotation(document)
        ? resolveAnnotation(document)
        : resolveDocument(document);
}
