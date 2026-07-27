// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    ViewerState,
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from 'triiiceratops';
import { activatePlugin } from '@triiiceratops/plugin-sdk';
import { createExamplePlugin } from './my-plugin';

const state = new ViewerState();
const activation = activatePlugin(createExamplePlugin(), {
    container: document.getElementById('host')!,
    viewerState: state,
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
});

// Later:
activation.deactivate();
