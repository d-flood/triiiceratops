// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PublishedState } from 'triiiceratops';

interface CounterState extends PublishedState {
    increment(): void;
    readonly count: number;
}

export function getCounterState(viewerState: {
    getPluginState(pluginId: string): unknown;
}): CounterState | null {
    const published = viewerState.getPluginState('counter');
    // Structural, not `instanceof`: the object crossed a package boundary.
    return published !== null &&
        typeof published === 'object' &&
        typeof (published as CounterState).increment === 'function'
        ? (published as CounterState)
        : null;
}
