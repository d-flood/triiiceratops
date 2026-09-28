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

const SOLID_RED_8 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR42mP4z8DwHx9mGBkKAMLXf4HVAzL9AAAAAElFTkSuQmCC';
const SOLID_BLUE_8 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEUlEQVR42mNgYPj/Hz8eEQoAQ1d/gea06iUAAAAASUVORK5CYII=';

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
