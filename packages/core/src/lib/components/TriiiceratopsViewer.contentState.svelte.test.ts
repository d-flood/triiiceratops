/**
 * Content-state ingestion, driven through the viewer's PUBLIC inputs only
 * (ADR 0006). Nothing here calls `parseContentState` or the ingestion helpers
 * directly: the ADR's vocabulary is `content-state`,
 * `read-content-state-from-url` and the discrete props, so its rules are
 * asserted in exactly those terms.
 *
 * What is pinned: the three-way precedence in all three directions — including
 * per-input, since `canvas-id` and `initial-canvas-region` outrank a content
 * state's canvas and region as surely as `manifest-id` outranks the whole of it
 * — URL reading off unless the host opts in and never re-read after mount, the
 * address bar left alone, a bare URI dereferenced through the manifest fetch
 * path exactly once, the media time a target carries applied, and ingestion that
 * reports instead of throwing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, tick } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import type { ViewerError } from '../types/viewerError';

const MANIFEST_ID = 'https://example.org/iiif/book/manifest';
const OTHER_MANIFEST_ID = 'https://example.org/iiif/atlas/manifest';
const AUDIO_MANIFEST_ID = 'https://example.org/iiif/recording/manifest';
const CONTENT_STATE_URI = 'https://example.org/iiif/state/1';
const CANVAS = (manifestId: string, name: string) =>
    `${manifestId}/canvas/${name}`;

function makeCanvas(manifestId: string, name: string) {
    const id = CANVAS(manifestId, name);
    return {
        id,
        type: 'Canvas',
        label: { en: [name] },
        width: 1000,
        height: 800,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `https://example.org/images/${name}.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            width: 1000,
                            height: 800,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

function makeManifest(manifestId: string) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: manifestId,
        type: 'Manifest',
        label: { en: [manifestId] },
        items: [makeCanvas(manifestId, 'p1'), makeCanvas(manifestId, 'p2')],
    };
}

/** An audio canvas, so a target's `#t=` has something temporal to land on. */
function makeAudioManifest() {
    const id = CANVAS(AUDIO_MANIFEST_ID, 'tone');
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: AUDIO_MANIFEST_ID,
        type: 'Manifest',
        label: { en: ['recording'] },
        items: [
            {
                id,
                type: 'Canvas',
                label: { en: ['tone'] },
                duration: 120,
                items: [
                    {
                        id: `${id}/page`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${id}/annotation`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: 'https://example.org/media/tone.mp3',
                                    type: 'Sound',
                                    format: 'audio/mpeg',
                                    duration: 120,
                                },
                                target: id,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

/** A content-state Annotation in the shape the cookbook publishes. */
function contentStateAnnotation(
    manifestId: string,
    canvasName: string,
    fragment = '',
) {
    return {
        id: 'https://example.org/state/annotation',
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            id: `${CANVAS(manifestId, canvasName)}${fragment}`,
            type: 'Canvas',
            partOf: [{ id: manifestId, type: 'Manifest' }],
        },
    };
}

function encode(document: unknown): string {
    return Buffer.from(JSON.stringify(document), 'utf8')
        .toString('base64url')
        .replace(/=+$/, '');
}

async function settle(ms = 500) {
    await tick();
    await new Promise((r) => setTimeout(r, ms));
    await tick();
}

describe('content-state ingestion through the viewer inputs', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    let errors: ViewerError[];

    /** Set the host's address, the way a link to the viewer would. */
    function setLocation(search: string) {
        window.history.replaceState({}, '', `/host/page${search}`);
    }

    beforeEach(() => {
        errors = [];
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async (url: string) => ({
            ok: true,
            json: async () =>
                String(url).startsWith(OTHER_MANIFEST_ID)
                    ? makeManifest(OTHER_MANIFEST_ID)
                    : makeManifest(MANIFEST_ID),
        }));
        target = document.createElement('div');
        document.body.appendChild(target);
        setLocation('');
    });

    afterEach(() => {
        target.remove();
        setLocation('');
        vi.restoreAllMocks();
    });

    /** Only the inputs this suite drives, so a prop set later still type-checks. */
    type Props = {
        viewerState?: any;
        onviewererror?: (error: ViewerError) => void;
        manifestId?: string;
        canvasId?: string;
        initialCanvasRegion?: {
            x: number;
            y: number;
            width: number;
            height: number;
        } | null;
        contentState?: string;
        readContentStateFromUrl?: boolean;
    };

    function mountViewer(props: Props) {
        const state: Props = $state({
            viewerState: undefined,
            onviewererror: (error: ViewerError) => {
                errors.push(error);
            },
            ...props,
        });
        return {
            state,
            app: mount(TriiiceratopsViewer, { target, props: state }),
        };
    }

    it('opens the view a content-state input names', async () => {
        const { state, app } = mountViewer({
            contentState: encode(
                contentStateAnnotation(MANIFEST_ID, 'p2', '#xywh=10,20,30,40'),
            ),
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));
        expect(state.viewerState?.initialCanvasRegion).toEqual({
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });

        await unmount(app);
    });

    it('lets the discrete props win over a content-state input', async () => {
        const { state, app } = mountViewer({
            manifestId: OTHER_MANIFEST_ID,
            contentState: encode(contentStateAnnotation(MANIFEST_ID, 'p2')),
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(
            CANVAS(OTHER_MANIFEST_ID, 'p1'),
        );

        await unmount(app);
    });

    it('lets a content-state input win over the URL parameter', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(OTHER_MANIFEST_ID, 'p1'))}`,
        );
        const { state, app } = mountViewer({
            contentState: encode(contentStateAnnotation(MANIFEST_ID, 'p2')),
            readContentStateFromUrl: true,
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

        await unmount(app);
    });

    it('lets the discrete props win over the URL parameter', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({
            manifestId: OTHER_MANIFEST_ID,
            readContentStateFromUrl: true,
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);

        await unmount(app);
    });

    it('reads the URL parameter when the host opts in', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({ readContentStateFromUrl: true });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

        await unmount(app);
    });

    it('does nothing with the URL parameter when the flag is absent', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({});
        await settle();

        expect(state.viewerState?.manifestId).toBeFalsy();
        expect(mockFetch).not.toHaveBeenCalled();

        await unmount(app);
    });

    it('leaves the host address bar exactly as it found it', async () => {
        const search = `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}&app=host`;
        setLocation(search);
        const before = window.location.href;

        const { state, app } = mountViewer({ readContentStateFromUrl: true });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(window.location.href).toBe(before);

        await unmount(app);
    });

    it('dereferences a URI-valued content state through the manifest fetch path', async () => {
        mockFetch.mockImplementation(async (url: string) => ({
            ok: true,
            json: async () =>
                String(url) === CONTENT_STATE_URI
                    ? contentStateAnnotation(MANIFEST_ID, 'p2')
                    : makeManifest(MANIFEST_ID),
        }));

        const { state, app } = mountViewer({
            contentState: CONTENT_STATE_URI,
        });
        await settle();

        expect(mockFetch).toHaveBeenCalledWith(
            CONTENT_STATE_URI,
            expect.anything(),
        );
        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

        await unmount(app);
    });

    it('fetches a URI that is itself the manifest exactly once', async () => {
        const { state, app } = mountViewer({ contentState: MANIFEST_ID });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(
            mockFetch.mock.calls.filter(([url]) => String(url) === MANIFEST_ID),
        ).toHaveLength(1);

        await unmount(app);
    });

    it('reports a failed dereference on the content-state scope instead of throwing', async () => {
        mockFetch.mockImplementation(async (url: string) => {
            if (String(url) === CONTENT_STATE_URI) {
                throw new Error('network down');
            }
            return { ok: true, json: async () => makeManifest(MANIFEST_ID) };
        });

        const { app } = mountViewer({ contentState: CONTENT_STATE_URI });
        await settle();

        expect(errors.map((error) => [error.scope, error.code])).toContainEqual(
            ['content-state', 'content-state-dereference-failed'],
        );

        await unmount(app);
    });

    it('degrades a content state naming no manifest to nothing, with a report', async () => {
        const { state, app } = mountViewer({
            contentState: encode({
                id: 'https://example.org/state/annotation',
                type: 'Annotation',
                motivation: 'contentState',
                target: { id: 'https://example.org/canvas/p1', type: 'Canvas' },
            }),
        });
        await settle();

        expect(state.viewerState?.manifestId).toBeFalsy();
        expect(errors.map((error) => [error.scope, error.code])).toContainEqual(
            ['content-state', 'content-state-unresolved'],
        );

        await unmount(app);
    });

    it('lets an explicit canvas-id win over the canvas a content state names', async () => {
        const { state, app } = mountViewer({
            canvasId: CANVAS(MANIFEST_ID, 'p1'),
            contentState: encode(contentStateAnnotation(MANIFEST_ID, 'p2')),
        });
        await settle();

        // The content state still opened its manifest — only its canvas lost.
        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p1'));

        await unmount(app);
    });

    it('lets an explicit initial-canvas-region win over a content state fragment', async () => {
        const hostRegion = { x: 1, y: 2, width: 3, height: 4 };
        const { state, app } = mountViewer({
            initialCanvasRegion: hostRegion,
            contentState: encode(
                contentStateAnnotation(MANIFEST_ID, 'p2', '#xywh=10,20,30,40'),
            ),
        });
        await settle();

        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));
        expect(state.viewerState?.initialCanvasRegion).toEqual(hostRegion);

        await unmount(app);
    });

    it('lets a manifest-id arriving mid-dereference win', async () => {
        let release: () => void = () => {};
        const dereference = new Promise<void>((resolve) => {
            release = resolve;
        });
        mockFetch.mockImplementation(async (url: string) => {
            if (String(url) === CONTENT_STATE_URI) {
                await dereference;
                return {
                    ok: true,
                    json: async () => contentStateAnnotation(MANIFEST_ID, 'p2'),
                };
            }
            return {
                ok: true,
                json: async () =>
                    String(url).startsWith(OTHER_MANIFEST_ID)
                        ? makeManifest(OTHER_MANIFEST_ID)
                        : makeManifest(MANIFEST_ID),
            };
        });

        const { state, app } = mountViewer({
            contentState: CONTENT_STATE_URI,
        });
        await tick();

        // The host takes manual control while the URI is still in flight.
        state.manifestId = OTHER_MANIFEST_ID;
        await settle(50);
        release();
        await settle();

        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(
            CANVAS(OTHER_MANIFEST_ID, 'p1'),
        );
        // Abandoned outright, not loaded and then corrected: the manifest the
        // content state named was never even requested.
        expect(mockFetch).not.toHaveBeenCalledWith(
            MANIFEST_ID,
            expect.anything(),
        );

        await unmount(app);
    });

    it('applies the media time a content state target carries', async () => {
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => makeAudioManifest(),
        }));

        const { state, app } = mountViewer({
            contentState: encode(
                contentStateAnnotation(AUDIO_MANIFEST_ID, 'tone', '#t=30'),
            ),
        });
        await settle();

        expect(state.viewerState?.canvasId).toBe(
            CANVAS(AUDIO_MANIFEST_ID, 'tone'),
        );
        expect(state.viewerState?.temporalOffset).toEqual({
            canvasId: CANVAS(AUDIO_MANIFEST_ID, 'tone'),
            seconds: 30,
        });

        await unmount(app);
    });

    it('never re-reads the URL on a later reactive run', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({
            manifestId: OTHER_MANIFEST_ID,
            readContentStateFromUrl: true,
        });
        await settle();
        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);

        // Clearing the prop must not send the viewer back to an address bar the
        // host's own routing may have moved on from.
        state.manifestId = undefined;
        await settle();

        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);

        await unmount(app);
    });

    it('ingests a content state delivered after mount', async () => {
        const { state, app } = mountViewer({});
        await settle();
        expect(state.viewerState?.manifestId).toBeFalsy();

        state.contentState = encode(
            contentStateAnnotation(OTHER_MANIFEST_ID, 'p2'),
        );
        await settle();

        expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(
            CANVAS(OTHER_MANIFEST_ID, 'p2'),
        );

        await unmount(app);
    });
});
