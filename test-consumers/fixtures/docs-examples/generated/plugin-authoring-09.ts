// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { CORE_VERSION, pluginApiVersion, capabilities } from 'triiiceratops';
import { ViewerState } from 'triiiceratops/svelte';
import { activatePlugin } from '@triiiceratops/plugin-sdk';
import {
    createStubLocaleService,
    createStubStyleService,
    createStubSurfaceService,
    createStubUiService,
} from '@triiiceratops/plugin-sdk/testing';
import { createExamplePlugin } from './my-plugin';

const state = new ViewerState();
const activation = activatePlugin(createExamplePlugin(), {
    container: document.getElementById('host')!,
    viewerState: state,
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
    styles: createStubStyleService(),
    locale: createStubLocaleService(),
    ui: createStubUiService(),
    // No chrome to hide the plugin, so the stub surface reports itself open.
    surface: createStubSurfaceService('example'),
    reportError: (report) => {
        console.error(report.phase, report.error);
    },
});

// Later:
activation.deactivate();
