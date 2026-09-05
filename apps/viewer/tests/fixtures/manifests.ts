/**
 * The Manifests the smoke screens serve to the viewer through `page.route`, kept
 * out of `public/` so nothing here is published at the cookbook's contract URL.
 *
 * Each Manifest's `id` is the absolute URL it is served from — the shape a real
 * cookbook Manifest has, and the one that lets the viewer register the document
 * it already dereferenced instead of requesting it a second time. A relative id
 * sends it down its documented degrade path, where the screens would stop
 * exercising what a recipe's link exercises.
 */

export function imageManifest(url: string): unknown {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['Smoke-screen image canvas'] },
        summary: {
            en: [
                'One canvas painted by a plain Image body carried as a data URL, so the smoke screens render an image canvas with no network and no image service.',
            ],
        },
        items: [
            {
                id: `${url}/canvas/1`,
                type: 'Canvas',
                label: { en: ['Solid square'] },
                width: 8,
                height: 8,
                items: [
                    {
                        id: `${url}/page/1`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${url}/annotation/1`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=',
                                    type: 'Image',
                                    format: 'image/png',
                                    width: 8,
                                    height: 8,
                                },
                                target: `${url}/canvas/1`,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

export function audioManifest(url: string, mediaUrl: string): unknown {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['Smoke-screen audio canvas'] },
        summary: {
            en: [
                'One Sound canvas with a duration and no width or height — the shape that does not render at all without the AV plugin. The media it names is fulfilled by the spec that loads it, so the fixture set carries no binary.',
            ],
        },
        items: [
            {
                id: `${url}/canvas/1`,
                type: 'Canvas',
                label: { en: ['Tone'] },
                duration: 1.0,
                items: [
                    {
                        id: `${url}/page/1`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${url}/annotation/1`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: mediaUrl,
                                    type: 'Sound',
                                    format: 'audio/wav',
                                    duration: 1.0,
                                },
                                target: `${url}/canvas/1`,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

/*
 * Two 8x8 canvases, each painted a single flat colour carried as a data URL. The
 * colour is how a screen names the canvas the viewer landed on: the DOM does not
 * publish the active canvas id, so a drop that claims to have opened canvas 2 is
 * only believed once the surface reads blue.
 */
const SOLID_RED_8 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR42mP4z8DwHx9mGBkKAMLXf4HVAzL9AAAAAElFTkSuQmCC';
const SOLID_BLUE_8 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEUlEQVR42mNgYPj/Hz8eEQoAQ1d/gea06iUAAAAASUVORK5CYII=';

/** The colours `twoCanvasManifest`'s canvases are painted, as `[r, g, b]`. */
export const CANVAS_COLORS = {
    1: [255, 0, 0],
    2: [0, 0, 255],
} as const;

export function twoCanvasManifest(url: string): unknown {
    const canvas = (index: 1 | 2, body: string) => ({
        id: `${url}/canvas/${index}`,
        type: 'Canvas',
        label: { en: [`Canvas ${index}`] },
        width: 8,
        height: 8,
        items: [
            {
                id: `${url}/page/${index}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${url}/annotation/${index}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: body,
                            type: 'Image',
                            format: 'image/png',
                            width: 8,
                            height: 8,
                        },
                        target: `${url}/canvas/${index}`,
                    },
                ],
            },
        ],
    });

    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['Smoke-screen two-canvas book'] },
        items: [canvas(1, SOLID_RED_8), canvas(2, SOLID_BLUE_8)],
    };
}
