import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

/**
 * The panel's own reading of the **unsupported presentation**: what the reader
 * is told about a range that holds an audiovisual canvas.
 *
 * `exportPdf.test.ts` pins that such a canvas produces no page; this file pins
 * that the panel agrees with the file it just made — the summary counts pages,
 * and a range with no pages in it says so instead of reporting a nameless
 * failure. The export logic itself is the real thing here; only `pdf-lib` is
 * stubbed, since no bytes are ever written in these paths.
 */

vi.mock('pdf-lib', () => ({
    StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
    TextRenderingMode: { Invisible: 'Invisible' },
    PDFDocument: {
        create: vi.fn(async () => ({
            addPage: vi.fn(),
            embedFont: vi.fn(async () => ({ widthOfTextAtSize: () => 10 })),
            embedPng: vi.fn(async () => ({ width: 10, height: 10 })),
            embedJpg: vi.fn(async () => ({ width: 10, height: 10 })),
            save: vi.fn(async () => new Uint8Array([1, 2, 3])),
        })),
    },
    popGraphicsState: vi.fn(),
    pushGraphicsState: vi.fn(),
    rgb: vi.fn(),
    setTextRenderingMode: vi.fn(),
}));

import {
    createTestViewerContext,
    flush,
} from '@triiiceratops/plugin-sdk/testing';

import { catalog } from './catalog';
import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
import Panel from './Panel.svelte';

const MANIFEST = 'https://example.org/manifest';

function imageCanvas(id: string) {
    return {
        id: `${MANIFEST}/canvas/${id}`,
        type: 'Canvas',
        label: { en: [id] },
        width: 1000,
        height: 1200,
        items: [
            {
                id: `${MANIFEST}/page/${id}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${MANIFEST}/anno/${id}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: `${MANIFEST}/canvas/${id}`,
                        body: {
                            id: `https://example.org/iiif/${id}/full/full/0/default.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            width: 1000,
                            height: 1200,
                        },
                    },
                ],
            },
        ],
    };
}

/** The shape of `av/0003-mvm-video`'s canvas: one `Video` body, nothing else. */
function videoCanvas(id: string) {
    return {
        id: `${MANIFEST}/canvas/${id}`,
        type: 'Canvas',
        label: { en: [id] },
        width: 640,
        height: 360,
        duration: 12,
        items: [
            {
                id: `${MANIFEST}/page/${id}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${MANIFEST}/anno/${id}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: `${MANIFEST}/canvas/${id}`,
                        body: {
                            id: `https://example.org/media/${id}.mp4`,
                            type: 'Video',
                            format: 'video/mp4',
                            width: 640,
                            height: 360,
                            duration: 12,
                        },
                    },
                ],
            },
        ],
    };
}

function manifest(canvases: unknown[]) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: MANIFEST,
        type: 'Manifest',
        label: { en: ['Mixed'] },
        items: canvases,
    };
}

/**
 * Mount the panel over a real `ViewerState` holding the given canvases, with
 * the whole range selected.
 */
async function mountPanel(target: HTMLElement, canvases: unknown[]) {
    const tc = createTestViewerContext({
        catalog,
        fixtures: {
            manifest: { id: MANIFEST, json: manifest(canvases) },
        },
    });

    // Manifest registration is asynchronous, so the canvases have to be in the
    // state before the panel reads them into its selectors.
    await flush();

    const app = mount(Panel, {
        target,
        context: new Map<symbol, PanelContext>([
            [PLUGIN_CONTEXT_KEY, { context: tc.context, config: {} }],
        ]),
    });

    const end = target.querySelector<HTMLSelectElement>('[data-tri-pdf-end]')!;
    end.value = String(canvases.length - 1);
    // Svelte 5 delegates `change` to the mount root, so the event has to bubble
    // to reach the handler.
    end.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    return { app, tc };
}

describe('PDF export panel over an audiovisual canvas', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('counts the pages the export will make, not the canvases in the range', async () => {
        const { app } = await mountPanel(target, [
            imageCanvas('one'),
            videoCanvas('film'),
            imageCanvas('three'),
        ]);

        // Three canvases are selected; two pages come out. The summary has to
        // describe the file, or it promises a page that is not in it.
        expect(target.querySelector('[data-tri-pdf-count]')?.textContent).toBe(
            '2',
        );

        await unmount(app);
    });

    it('explains a range with nothing exportable in it instead of failing namelessly', async () => {
        const { app } = await mountPanel(target, [videoCanvas('film')]);

        expect(target.querySelector('[data-tri-pdf-count]')?.textContent).toBe(
            '0',
        );

        target
            .querySelector<HTMLButtonElement>('[data-tri-pdf-export]')!
            .click();
        await vi.waitFor(() =>
            expect(target.querySelector('.tri-pdf-alert-error')).not.toBeNull(),
        );

        expect(
            target.querySelector('.tri-pdf-alert-error')?.textContent,
        ).toContain(catalog.en!.pdf_export_error_no_canvases_exported);

        await unmount(app);
    });
});
