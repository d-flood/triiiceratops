/**
 * Entry for `public/e2e/harness.html`: mounts <triiiceratops-viewer> from the
 * query string and nothing else.
 *
 * Dev-server only: no shipped bundle has this file in its graph, so neither the
 * plugin imports nor the devtools instrumentation the harness page loads
 * alongside it can reach a consumer.
 */
import '../lib/custom-element';
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
import { PdfExportPlugin } from '@triiiceratops/plugin-pdf-export';
import { AnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';
import { AvPlugin } from '@triiiceratops/plugin-av';
import type { ViewerConfig } from '../lib/types/config';
import type { SdkPlugin } from '../lib/types/plugin';

const params = new URLSearchParams(window.location.search);

/**
 * The effective defaults every e2e spec was written against: chrome visible,
 * every panel closed. Specs override only the keys they care about via
 * `?config=`, so changing a value here changes what the whole suite assumes.
 */
const defaultConfig: ViewerConfig = {
    showToggle: true,
    toolbarOpen: true,
    showCanvasNav: true,
    showZoomControls: true,
    leftPanelWidth: '320px',
    rightPanelWidth: '320px',
    toolbar: {
        showSearch: true,
        showGallery: true,
        showAnnotations: true,
        showFullscreen: true,
        showInfo: true,
        showViewingMode: true,
    },
    gallery: {
        open: false,
        showCloseButton: true,
        dockPosition: 'bottom',
    },
    search: {
        open: false,
        showCloseButton: true,
        query: '',
    },
    annotations: {
        open: false,
        showCloseButton: true,
    },
    information: {
        open: false,
        showCloseButton: true,
        position: 'right',
        showButton: true,
    },
    structures: {
        open: false,
        showCloseButton: true,
    },
    collection: {
        open: false,
        showCloseButton: true,
    },
};

let config = defaultConfig;
const configParam = params.get('config');
if (configParam) {
    try {
        config = { ...defaultConfig, ...JSON.parse(configParam) };
    } catch (e) {
        console.error('Failed to parse config from URL', e);
    }
}

// Each plugin is typed against `@triiiceratops/plugin-sdk`, whose type-only
// import of core's plugin types resolves to core's *published* `dist/types`:
// structurally identical to core's own `src/lib/types` but nominally distinct.
// Same in-repo boundary cast the demo makes; runtime is unaffected.
const plugins = [
    ImageManipulationPlugin,
    ImageDownloadPlugin,
    PdfExportPlugin,
    AnnotationEditorPlugin,
    AvPlugin,
] as unknown as SdkPlugin[];

const viewer = document.createElement('triiiceratops-viewer') as HTMLElement & {
    plugins: SdkPlugin[];
};

viewer.setAttribute('manifest-id', params.get('manifest') ?? '');
const canvasId = params.get('canvas');
if (canvasId) {
    viewer.setAttribute('canvas-id', canvasId);
}
viewer.setAttribute('theme', params.get('theme') ?? 'light');
viewer.setAttribute('config', JSON.stringify(config));
viewer.plugins = plugins;

document.body.append(viewer);
