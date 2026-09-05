/**
 * Turning one of the viewer's two content-state channels — the `content-state`
 * input or the `iiif-content` URL parameter — into a view target (ADR 0006).
 *
 * `parseContentState` never fetches, so a content state delivered as a bare URI
 * arrives here as nothing but a manifest id. Dereferencing it is this module's
 * job, and it goes through the same manifest fetch path a `manifest-id` would:
 * a content-state URI is exactly as trusted as a manifest URI, and the embedding
 * page's CSP is the control (see the `/docs/csp/` page).
 *
 * Nothing here throws. Every failure degrades to the most the caller can honor
 * and reports on the `content-state` {@link ViewerErrorScope}.
 */

import { manifestsState } from '../state/manifests.svelte';
import type { RequestConfig } from '../types/config';
import type { ViewerError } from '../types/viewerError';
import {
    isManifestDocument,
    parseContentState,
    type ContentStateTarget,
} from './contentState';

/** The parameter name the IIIF Content State API reserves. */
const IIIF_CONTENT_PARAM = 'iiif-content';

export interface ContentStateIngestionOptions {
    /** The same request configuration the manifest path uses. */
    requestConfig?: RequestConfig;
    /** The viewer's structured failure channel. */
    report: (error: ViewerError) => void;
}

/**
 * The `iiif-content` parameter of the host's current address, or `undefined`.
 *
 * Read-only by construction: the address bar is never mutated, so URL cleanup
 * and SPA re-navigation stay the consumer's concern (ADR 0006). SSR-safe.
 */
export function readContentStateFromLocation(): string | undefined {
    if (typeof window === 'undefined' || !window.location?.search) {
        return undefined;
    }
    const value = new URLSearchParams(window.location.search).get(
        IIIF_CONTENT_PARAM,
    );
    return value?.trim() || undefined;
}

export interface ResolvedContentState {
    /** The view target the caller drives the viewer with. */
    target: ContentStateTarget;
    /**
     * The dereferenced document, when the URI turned out to name the manifest
     * the target does — so the caller registers what is already in hand rather
     * than requesting the same URL a second time. Absent for a Collection: only
     * the fetching manifest path expands one into its members.
     */
    manifestJson?: unknown;
}

/**
 * Resolve a delivered content state into a view target, dereferencing a bare URI
 * through the manifest fetch path.
 *
 * A dereferenced document is re-parsed rather than inspected here, so the shape
 * rules live in `contentState` alone: it decides the target, and
 * {@link isManifestDocument} decides whether the document in hand IS that
 * target. Where it is, the caller registers it instead of requesting a second
 * URL — which for a Manifest declaring an id other than the one it was served
 * from is not the same document and need not be a manifest at all. Anything
 * else falls back to the pre-dereference target, whose manifest load handles a
 * Collection and a Manifest alike.
 */
export async function resolveContentState(
    value: string,
    { requestConfig, report }: ContentStateIngestionOptions,
): Promise<ResolvedContentState | null> {
    const parsed = parseContentState(value);
    if (!parsed) {
        report({
            severity: 'warning',
            scope: 'content-state',
            code: 'content-state-unresolved',
            message:
                'The content state resolved to no manifest and was ignored. ' +
                'Nothing in it names a Manifest.',
            detail: { contentState: value },
        });
        return null;
    }

    if (!isBareUri(value)) return { target: parsed };

    try {
        const document = await manifestsState.fetchResource(
            value,
            requestConfig,
        );
        const target = parseContentState(JSON.stringify(document)) ?? parsed;
        return isManifestDocument(document)
            ? { target, manifestJson: document }
            : { target };
    } catch (error) {
        report({
            severity: 'error',
            scope: 'content-state',
            code: 'content-state-dereference-failed',
            message:
                `Could not dereference the content state at ${value}. ` +
                'Loading it as a manifest instead. If the embedding page ' +
                'restricts `connect-src`, that host must be allowed.',
            error,
            detail: { contentState: value },
        });
        return { target: parsed };
    }
}

function isBareUri(value: string): boolean {
    return /^https?:\/\//i.test(value);
}
