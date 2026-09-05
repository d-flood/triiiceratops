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
