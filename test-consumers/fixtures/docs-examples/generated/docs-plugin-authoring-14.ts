// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext, PublishedState } from 'triiiceratops';

interface CounterState extends PublishedState {
    increment(): void;
    readonly count: number;
}

function publish(context: PluginContext) {
    let count = 0;
    const listeners = new Set<() => void>();

    const state: CounterState = {
        // Commands maintain the invariants; nothing outside writes `count`.
        increment() {
            count += 1;
            for (const listener of listeners) listener();
        },
        get count() {
            return count;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Every member above, classified. The seam's own members are not.
        stateInventory: { increment: 'command', count: 'observable' },
    };

    context.publishState(state);
}
