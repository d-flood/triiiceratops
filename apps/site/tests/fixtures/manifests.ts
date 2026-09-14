/**
 * The Manifests the smoke screens serve to the viewer through `page.route`, kept
 * out of `static/` so nothing here is published at the cookbook's contract URL.
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

/**
 * An image canvas carrying one non-painting annotation, the shape the Cookbook's
 * commenting recipes have: a `TextualBody` targeting the canvas, which is what
 * the annotation panel lists.
 */
export function annotatedManifest(url: string): unknown {
    const manifest = imageManifest(url) as {
        items: Record<string, unknown>[];
    };
    manifest.items[0].annotations = [
        {
            id: `${url}/annotations/1`,
            type: 'AnnotationPage',
            items: [
                {
                    id: `${url}/annotation/comment/1`,
                    type: 'Annotation',
                    motivation: 'commenting',
                    body: {
                        type: 'TextualBody',
                        language: 'en',
                        format: 'text/plain',
                        value: 'A comment on the whole canvas.',
                    },
                    target: `${url}/canvas/1`,
                },
            ],
        },
    ];
    return manifest;
}

/**
 * An image canvas whose descriptive properties are authored in more than one
 * language, the shape recipe 0006 has. The viewer's language picker is driven by
 * the languages the MANIFEST carries, not by the chrome catalogs the host
 * offers, so a single-language fixture leaves the picker hidden and no screen
 * can see it.
 */
export function multilingualManifest(url: string): unknown {
    const manifest = imageManifest(url) as Record<string, unknown>;
    manifest.label = { en: ['A picture'], fr: ['Une image'] };
    manifest.summary = {
        en: ['Authored in English and in French.'],
        fr: ['Rédigé en anglais et en français.'],
    };
    manifest.metadata = [
        {
            label: { en: ['Author'], fr: ['Auteur'] },
            value: { en: ['Anonymous'], fr: ['Anonyme'] },
        },
    ];
    return manifest;
}

/**
 * A Collection of two manifests, the shape recipe 0032 has. Its members are
 * served from the same directory the collection is, as the Cookbook serves them.
 */
export function collectionDocument(url: string): unknown {
    const base = url.slice(0, url.lastIndexOf('/'));
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Collection',
        label: { en: ['Smoke-screen collection'] },
        items: [1, 2].map((index) => ({
            id: `${base}/manifest-0${index}.json`,
            type: 'Manifest',
            label: { en: [`Volume ${index}`] },
        })),
    };
}

/**
 * An image canvas under a one-range `structures` tree, the shape the table of
 * contents recipes have. The structures panel renders the ranges, so a manifest
 * without them leaves it empty.
 */
export function rangedManifest(url: string): unknown {
    const manifest = imageManifest(url) as Record<string, unknown>;
    manifest.structures = [
        {
            id: `${url}/range/1`,
            type: 'Range',
            label: { en: ['Chapter 1'] },
            items: [{ id: `${url}/canvas/1`, type: 'Canvas' }],
        },
    ];
    return manifest;
}

/**
 * A Sound canvas carrying an annotation targeted at a stretch of the recording,
 * the shape recipe 0103 has. `@triiiceratops/plugin-av` lists these against the
 * playhead in its own panel rather than leaving them to the annotation panel.
 */
export function timedAnnotationManifest(
    url: string,
    mediaUrl: string,
): unknown {
    const manifest = audioManifest(url, mediaUrl) as {
        items: Record<string, unknown>[];
    };
    manifest.items[0].annotations = [
        {
            id: `${url}/annotations/1`,
            type: 'AnnotationPage',
            items: [
                {
                    id: `${url}/annotation/note/1`,
                    type: 'Annotation',
                    motivation: 'commenting',
                    body: {
                        type: 'TextualBody',
                        language: 'en',
                        format: 'text/plain',
                        value: 'Soft laughter, rustling',
                    },
                    target: `${url}/canvas/1#t=0.1,0.5`,
                },
            ],
        },
    ];
    return manifest;
}
