/** First-party plugins the builder can add, declared once as data. */

import type { SitePlugin } from '../sitePlugins';

export type BuilderPlugin = {
    readonly id: string;
    readonly label: string;
    readonly say: string;
    readonly pkg: string;
    readonly symbol: string;
    readonly doc: string;
    readonly href: string;
    readonly load: () => Promise<SitePlugin>;
};

const doc = (slug: string) => ({ doc: slug, href: `/docs/${slug}/` });

export const BUILDER_PLUGINS: readonly BuilderPlugin[] = [
    {
        id: 'image-manipulation',
        label: 'Image tools',
        say: 'Brightness, contrast, saturation, invert and grayscale, in a flyout over the canvas.',
        pkg: '@triiiceratops/plugin-image-manipulation',
        symbol: 'ImageManipulationPlugin',
        ...doc('plugin-image-manipulation'),
        load: async () =>
            (await import('@triiiceratops/plugin-image-manipulation'))
                .ImageManipulationPlugin as unknown as SitePlugin,
    },
    {
        id: 'av',
        label: 'Audio and video',
        say: 'Plays a time-based canvas: a media stage, transport in the control bar, captions and a transcript.',
        pkg: '@triiiceratops/plugin-av',
        symbol: 'AvPlugin',
        ...doc('plugin-av'),
        load: async () =>
            (await import('@triiiceratops/plugin-av'))
                .AvPlugin as unknown as SitePlugin,
    },
    {
        id: 'pdf-export',
        label: 'PDF download',
        say: 'Exports a range of canvases as a PDF the browser generates, one page per canvas.',
        pkg: '@triiiceratops/plugin-pdf-export',
        symbol: 'PdfExportPlugin',
        ...doc('plugin-pdf-export'),
        load: async () =>
            (await import('@triiiceratops/plugin-pdf-export'))
                .PdfExportPlugin as unknown as SitePlugin,
    },
    {
        id: 'image-download',
        label: 'Image download',
        say: 'Downloads the canvas as a raster image, including a canvas painted with more than one image.',
        pkg: '@triiiceratops/plugin-image-export',
        symbol: 'ImageDownloadPlugin',
        ...doc('plugin-image-export'),
        load: async () =>
            (await import('@triiiceratops/plugin-image-export'))
                .ImageDownloadPlugin as unknown as SitePlugin,
    },
    {
        id: 'annotation-editor',
        label: 'Annotation editor',
        say: 'Draws rectangle, ellipse, polygon, point and whole-canvas annotations, stored through a pluggable adapter.',
        pkg: '@triiiceratops/plugin-annotation-editor',
        symbol: 'AnnotationEditorPlugin',
        ...doc('plugin-annotation-editor'),
        load: async () =>
            (await import('@triiiceratops/plugin-annotation-editor'))
                .AnnotationEditorPlugin as unknown as SitePlugin,
    },
];
