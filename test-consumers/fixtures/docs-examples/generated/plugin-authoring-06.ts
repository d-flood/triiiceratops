// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { Component } from 'svelte';
import type { ViewerState } from 'triiiceratops';

interface PluginDef {
    id?: string; // Unique identifier (auto-generated if not provided)
    name: string; // Title shown in tooltips/headers
    icon: Component; // Svelte icon component
    target?: 'panel' | 'flyout'; // Where the UI renders (default: 'panel')
    panel?: Component; // Component rendered when target is 'panel'
    flyout?: Component; // Component rendered when target is 'flyout'
    position?: 'left' | 'right'; // Panel position (default: 'left'; ignored for flyouts)
    props?: Record<string, unknown>; // Optional props to pass to the component
    onInit?: (viewerState: ViewerState) => void; // Called once when the plugin activates
}
