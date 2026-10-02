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
        say: 'Brightness, contrast, saturation, invert, and grayscale adjustments.',
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
        say: 'Audio and video playback with captions and transcript.',
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
        say: 'Export a range of canvases as a PDF, one page per canvas.',
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
        say: 'Download the current canvas as an image, including multi-image canvases.',
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
        say: 'Create rectangle, ellipse, polygon, point, and whole-canvas annotations, with a pluggable storage adapter.',
        pkg: '@triiiceratops/plugin-annotation-editor',
        symbol: 'AnnotationEditorPlugin',
        ...doc('plugin-annotation-editor'),
        load: async () =>
            (await import('@triiiceratops/plugin-annotation-editor'))
                .AnnotationEditorPlugin as unknown as SitePlugin,
    },
];
