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
        items: [
            makeCanvas(manifestId, 'p1'),
            makeCanvas(manifestId, 'p2'),
            makeCanvas(manifestId, 'p3'),
        ],
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

const CHOICE_MANIFEST_ID = 'https://example.org/iiif/multispectral/manifest';
const XRAY = 'https://example.org/images/xray.jpg';

/** The book with its second canvas offering a natural-light or X-ray image. */
function makeChoiceManifest() {
    const manifest: any = makeManifest(CHOICE_MANIFEST_ID);
    const annotation = manifest.items[1].items[0].items[0];
    annotation.body = {
        type: 'Choice',
        items: [annotation.body, { ...annotation.body, id: XRAY }],
    };
    return manifest;
}

/** A content state naming the X-ray alternative on the second canvas. */
function choiceContentState() {
    const canvas = CANVAS(CHOICE_MANIFEST_ID, 'p2');
    return {
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            type: 'SpecificResource',
            source: {
                id: canvas,
                type: 'Canvas',
                partOf: [{ id: CHOICE_MANIFEST_ID, type: 'Manifest' }],
            },
            selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' },
            state: {
                type: 'ChoiceState',
                selections: [
                    {
                        annotation: {
                            id: `${canvas}/annotation`,
                            type: 'Annotation',
                        },
                        selectedItem: { id: XRAY, type: 'Image' },
                    },
                ],
            },
        },
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
                String(url).startsWith(CHOICE_MANIFEST_ID)
                    ? makeChoiceManifest()
                    : String(url).startsWith(OTHER_MANIFEST_ID)
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
        writeContentStateToUrl?: boolean;
        contentStateUrlParam?: string;
        acceptDroppedContentState?: boolean;
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

    it('shows the Choice alternative a content state names', async () => {
        const { state, app } = mountViewer({
            contentState: encode(choiceContentState()),
        });
        await settle();

        const canvas = CANVAS(CHOICE_MANIFEST_ID, 'p2');
        expect(state.viewerState?.canvasId).toBe(canvas);
        expect(state.viewerState?.initialCanvasRegion).toEqual({
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        });
        expect(state.viewerState?.getSelectedChoice(canvas)).toBe(XRAY);

        await unmount(app);
    });

    it('returns to the default alternative for a later content state naming none', async () => {
        const { state, app } = mountViewer({
            contentState: encode(choiceContentState()),
        });
        await settle();

        state.contentState = encode(
            contentStateAnnotation(CHOICE_MANIFEST_ID, 'p2'),
        );
        await settle();

        const canvas = CANVAS(CHOICE_MANIFEST_ID, 'p2');
        expect(state.viewerState?.getSelectedChoice(canvas)).toBeUndefined();

        await unmount(app);
    });

    /*
     * Cookbook recipe 0599. The drag half is the host's; what the viewer owes
     * is a destination that reads `text/plain` — and only when the host asked
     * for one, since a viewer dropped into a page it does not own must not
     * swallow a drop the host meant to handle itself.
     */
    describe('a dropped content state', () => {
        function drop(payload: string, type = 'text/plain') {
            const root = target.querySelector('#triiiceratops-viewer')!;
            const dataTransfer = {
                types: [type],
                getData: (asked: string) => (asked === type ? payload : ''),
            };
            for (const name of ['dragover', 'drop']) {
                const event = new Event(name, {
                    bubbles: true,
                    cancelable: true,
                });
                Object.defineProperty(event, 'dataTransfer', {
                    value: dataTransfer,
                });
                root.dispatchEvent(event);
            }
        }

        it('opens what it names, once the host opts in', async () => {
            const { state, app } = mountViewer({
                acceptDroppedContentState: true,
            });
            await settle();

            drop(JSON.stringify(contentStateAnnotation(MANIFEST_ID, 'p2')));
            await settle();

            expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

            await unmount(app);
        });

        // Recipe 0599's FIRST drag source, which targets a Manifest and names
        // no canvas inside it.
        it('opens a manifest-target state, as the recipe publishes it', async () => {
            const { state, app } = mountViewer({
                acceptDroppedContentState: true,
            });
            await settle();

            drop(
                JSON.stringify({
                    id: 'https://example.org/state/annotation',
                    type: 'Annotation',
                    motivation: ['contentState'],
                    target: { id: MANIFEST_ID, type: 'Manifest' },
                }),
            );
            await settle();

            expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);

            await unmount(app);
        });

        it('stays inert until then', async () => {
            const { state, app } = mountViewer({});
            await settle();

            drop(JSON.stringify(contentStateAnnotation(MANIFEST_ID, 'p2')));
            await settle();

            expect(state.viewerState?.manifestId).toBeFalsy();

            await unmount(app);
        });

        /*
         * The reader's own gesture, so it replaces what the host opened.
         * ADR 0006 orders the DECLARED sources among themselves; a drop is
         * not one of them.
         */
        it('replaces the manifest a discrete prop opened', async () => {
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                acceptDroppedContentState: true,
            });
            await settle();

            drop(
                JSON.stringify(contentStateAnnotation(OTHER_MANIFEST_ID, 'p1')),
            );
            await settle();

            expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);

            await unmount(app);
        });

        /*
         * The failure recipe 0599 walks into: its drag source is an `<img>`,
         * so a browser offers the logo's own URL on `text/uri-list`. Reading
         * that flavour loads a PNG.
         */
        it('ignores a drag carrying only text/uri-list', async () => {
            const { state, app } = mountViewer({
                acceptDroppedContentState: true,
            });
            await settle();

            drop('https://iiif.io/img/logo-iiif.png', 'text/uri-list');
            await settle();

            expect(state.viewerState?.manifestId).toBeFalsy();

            await unmount(app);
        });
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

    it('reads the URL on mount when writing is enabled', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({
            readContentStateFromUrl: false,
            writeContentStateToUrl: true,
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

        await unmount(app);
    });

    it('reads the named parameter and ignores iiif-content', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(OTHER_MANIFEST_ID, 'p1'))}` +
                `&item-view=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({
            readContentStateFromUrl: true,
            contentStateUrlParam: ' item-view ',
        });
        await settle();

        expect(state.viewerState?.manifestId).toBe(MANIFEST_ID);
        expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

        await unmount(app);
    });

    it('reads iiif-content when the parameter name is empty', async () => {
        setLocation(
            `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p2'))}`,
        );
        const { state, app } = mountViewer({
            readContentStateFromUrl: true,
            contentStateUrlParam: '',
        });
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

    describe('a written URL view, with writing on', () => {
        const URL_REGION = { x: 10, y: 20, width: 30, height: 40 };
        const urlState = (manifestId = MANIFEST_ID, canvas = 'p2') =>
            `?iiif-content=${encode(
                contentStateAnnotation(manifestId, canvas, '#xywh=10,20,30,40'),
            )}`;

        function expectRestored(state: Props, manifestId = MANIFEST_ID) {
            expect(state.viewerState?.manifestId).toBe(manifestId);
            expect(state.viewerState?.canvasId).toBe(CANVAS(manifestId, 'p2'));
            expect(state.viewerState?.navigationRegion).toEqual({
                canvasId: CANVAS(manifestId, 'p2'),
                ...URL_REGION,
            });
        }

        it('restores its Choice alternative for the host-named manifest', async () => {
            setLocation(`?iiif-content=${encode(choiceContentState())}`);
            const { state, app } = mountViewer({
                manifestId: CHOICE_MANIFEST_ID,
                writeContentStateToUrl: true,
            });
            await settle();

            const canvas = CANVAS(CHOICE_MANIFEST_ID, 'p2');
            expect(state.viewerState?.canvasId).toBe(canvas);
            expect(state.viewerState?.getSelectedChoice(canvas)).toBe(XRAY);

            await unmount(app);
        });

        it('beats canvas-id for the host-named manifest', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                canvasId: CANVAS(MANIFEST_ID, 'p1'),
                writeContentStateToUrl: true,
            });
            await settle();

            expectRestored(state);

            await unmount(app);
        });

        it('beats initial-canvas-region', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                initialCanvasRegion: { x: 1, y: 2, width: 3, height: 4 },
                writeContentStateToUrl: true,
            });
            await settle();

            expectRestored(state);
            expect(state.viewerState?.initialCanvasRegion).toBeNull();

            await unmount(app);
        });

        it("beats a content-state input's canvas and region", async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                contentState: encode(
                    contentStateAnnotation(MANIFEST_ID, 'p1', '#xywh=1,2,3,4'),
                ),
                writeContentStateToUrl: true,
            });
            await settle();

            expectRestored(state);
            expect(state.viewerState?.initialCanvasRegion).toBeNull();

            await unmount(app);
        });

        it('applies its media time', async () => {
            mockFetch.mockImplementation(async () => ({
                ok: true,
                json: async () => makeAudioManifest(),
            }));
            setLocation(
                `?iiif-content=${encode(
                    contentStateAnnotation(AUDIO_MANIFEST_ID, 'tone', '#t=30'),
                )}`,
            );
            const { state, app } = mountViewer({
                manifestId: AUDIO_MANIFEST_ID,
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.temporalOffset).toEqual({
                canvasId: CANVAS(AUDIO_MANIFEST_ID, 'tone'),
                seconds: 30,
            });

            await unmount(app);
        });

        it('is ignored when it names another manifest than manifest-id', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                manifestId: OTHER_MANIFEST_ID,
                canvasId: CANVAS(OTHER_MANIFEST_ID, 'p3'),
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
            expect(state.viewerState?.canvasId).toBe(
                CANVAS(OTHER_MANIFEST_ID, 'p3'),
            );
            expect(mockFetch).not.toHaveBeenCalledWith(
                MANIFEST_ID,
                expect.anything(),
            );

            await unmount(app);
        });

        it('matches a relative manifest-id against its absolute manifest', async () => {
            const relative = '/iiif/book/manifest';
            const absolute = new URL(relative, document.baseURI).href;
            mockFetch.mockImplementation(async () => ({
                ok: true,
                json: async () => makeManifest(relative),
            }));
            setLocation(urlState(absolute));
            const { state, app } = mountViewer({
                manifestId: relative,
                canvasId: CANVAS(relative, 'p1'),
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(relative, 'p2'));
            expect(state.viewerState?.navigationRegion).toEqual({
                canvasId: CANVAS(relative, 'p2'),
                ...URL_REGION,
            });

            await unmount(app);
        });

        it('stays put when manifest-id and canvas-id arrive after the restore', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                writeContentStateToUrl: true,
            });
            await settle();
            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));
            const requests = mockFetch.mock.calls.length;

            state.manifestId = MANIFEST_ID;
            await settle();
            state.canvasId = CANVAS(MANIFEST_ID, 'p1');
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));
            expect(state.viewerState?.initialCanvasRegion).toEqual(URL_REGION);
            expect(mockFetch.mock.calls.length).toBe(requests);

            await unmount(app);
        });

        it('keeps canvas-id and initial-canvas-region when the host names no manifest', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                canvasId: CANVAS(MANIFEST_ID, 'p3'),
                initialCanvasRegion: { x: 1, y: 2, width: 3, height: 4 },
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p3'));
            expect(state.viewerState?.initialCanvasRegion).toEqual({
                x: 1,
                y: 2,
                width: 3,
                height: 4,
            });
            expect(state.viewerState?.navigationRegion).toBeNull();

            await unmount(app);
        });

        it("falls back to the content-state input's view when its canvas is missing", async () => {
            setLocation(urlState(MANIFEST_ID, 'p9'));
            const { state, app } = mountViewer({
                contentState: encode(
                    contentStateAnnotation(MANIFEST_ID, 'p3', '#xywh=1,2,3,4'),
                ),
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p3'));
            expect(state.viewerState?.initialCanvasRegion).toEqual({
                x: 1,
                y: 2,
                width: 3,
                height: 4,
            });

            await unmount(app);
        });

        it("keeps the content-state input's time when its canvas is missing", async () => {
            mockFetch.mockImplementation(async () => ({
                ok: true,
                json: async () => makeAudioManifest(),
            }));
            setLocation(
                `?iiif-content=${encode(
                    contentStateAnnotation(AUDIO_MANIFEST_ID, 'gone', '#t=30'),
                )}`,
            );
            const { state, app } = mountViewer({
                contentState: encode(
                    contentStateAnnotation(AUDIO_MANIFEST_ID, 'tone', '#t=18'),
                ),
                writeContentStateToUrl: true,
            });
            await settle();

            expect(state.viewerState?.temporalOffset).toEqual({
                canvasId: CANVAS(AUDIO_MANIFEST_ID, 'tone'),
                seconds: 18,
            });

            await unmount(app);
        });

        it('lets canvas-id apply again after the host leaves the restored manifest', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                canvasId: CANVAS(MANIFEST_ID, 'p3'),
                writeContentStateToUrl: true,
            });
            await settle();
            expectRestored(state);

            state.manifestId = OTHER_MANIFEST_ID;
            await settle();
            expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
            state.manifestId = MANIFEST_ID;
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p3'));

            await unmount(app);
        });

        it('lets a first canvas-id navigate once a content state opens another manifest', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                writeContentStateToUrl: true,
            });
            await settle();
            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p2'));

            state.contentState = encode(
                contentStateAnnotation(OTHER_MANIFEST_ID, 'p2'),
            );
            await settle();
            expect(state.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
            state.canvasId = CANVAS(OTHER_MANIFEST_ID, 'p3');
            await settle();

            expect(state.viewerState?.canvasId).toBe(
                CANVAS(OTHER_MANIFEST_ID, 'p3'),
            );

            await unmount(app);
        });

        it('lets a later canvas-id change navigate', async () => {
            setLocation(urlState());
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                canvasId: CANVAS(MANIFEST_ID, 'p1'),
                writeContentStateToUrl: true,
            });
            await settle();
            expectRestored(state);

            state.canvasId = CANVAS(MANIFEST_ID, 'p3');
            await settle();

            expect(state.viewerState?.canvasId).toBe(CANVAS(MANIFEST_ID, 'p3'));

            await unmount(app);
        });

        it('reads the named content state URL parameter', async () => {
            setLocation(
                `?iiif-content=${encode(contentStateAnnotation(MANIFEST_ID, 'p3'))}` +
                    `&item-view=${encode(
                        contentStateAnnotation(
                            MANIFEST_ID,
                            'p2',
                            '#xywh=10,20,30,40',
                        ),
                    )}`,
            );
            const { state, app } = mountViewer({
                manifestId: MANIFEST_ID,
                canvasId: CANVAS(MANIFEST_ID, 'p1'),
                writeContentStateToUrl: true,
                contentStateUrlParam: 'item-view',
            });
            await settle();

            expectRestored(state);

            await unmount(app);
        });
    });
});
