/**
 * The first-party plugins the builder can add to a viewer, declared once as
 * data.
 *
 * A plugin is not configuration: it is a package a consumer installs and hands
 * to the viewer through its `plugins` list. So picking one here changes two
 * things and only two — what the preview above is running, and what the
 * snippets below import. Nothing about a plugin reaches the configuration
 * object or the share link, because neither of those can carry a module.
 *
 * `tests/unit/builder-plugins.test.ts` holds every entry to the documentation
 * page that covers the same plugin: the package specifier and the export the
 * snippets import are read out of `apps/site/content/docs/`, so a renamed
 * export fails the suite rather than shipping a paste that resolves to nothing.
 *
 * The annotation editor is not offered here.
 */

import type { SitePlugin } from '../sitePlugins';

export type BuilderPlugin = {
    /** The plugin's stable `uiId`, which is also its key under `config.plugins`. */
    readonly id: string;
    readonly label: string;
    /** One line on what the plugin gives a reader. */
    readonly say: string;
    /** The package a consumer installs, and the specifier the snippets import. */
    readonly pkg: string;
    /** The export the snippets import from it. */
    readonly symbol: string;
    /** The documentation page whose form the snippet follows. */
    readonly doc: string;
    readonly href: string;
    /**
     * The module itself, fetched only when a reader turns the plugin on. This
     * page is under the same score gate as every other marketing route, and
     * four plugin bundles nobody asked for would be four bundles on the load of
     * a page whose own claim is that it loads fast.
     *
     * Each plugin is typed against `@triiiceratops/plugin-sdk`, whose type-only
     * import of core's plugin types resolves to core's *published* `dist/types`.
     * Those are structurally identical to core's own types but nominally
     * distinct, so the cast is this in-repo boundary and nothing else; runtime
     * is unaffected.
     */
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
];
