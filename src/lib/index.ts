// Main Svelte component export
export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';

// Type exports for TypeScript users
export { ViewerState, VIEWER_STATE_KEY } from './state/viewer.svelte';
export { ManifestsState } from './state/manifests.svelte';

// Plugin system exports
export type {
    TriiiceratopsPlugin,
    PluginContext,
    PluginMenuButton,
    PluginPanel,
} from './types/plugin';
export { BasePlugin } from './types/plugin';
