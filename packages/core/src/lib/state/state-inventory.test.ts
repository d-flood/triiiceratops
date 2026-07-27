import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import { STATE_INVENTORY, type StateInventoryEntry } from './state-inventory';

vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getAnnotations: vi.fn(() => []),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

/**
 * Reflect the set of mutable members from a live instance:
 *  - own enumerable, writable data properties (reactive collections such as
 *    SvelteSet/SvelteMap and plain private fields), and
 *  - accessor properties that expose a setter anywhere on the prototype chain
 *    (Svelte compiles every `$state` field, plus hand-written get/set pairs,
 *    into prototype accessors).
 *
 * Getter-only accessors (query getters like `manifest`, `hasNext`) and methods
 * are intentionally excluded: they are not mutable members.
 */
function getMutableMembers(instance: object): Set<string> {
    const members = new Set<string>();

    for (const [name, desc] of Object.entries(
        Object.getOwnPropertyDescriptors(instance),
    )) {
        if (desc.enumerable && 'value' in desc && desc.writable) {
            members.add(name);
        }
    }

    let proto: object | null = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
        for (const [name, desc] of Object.entries(
            Object.getOwnPropertyDescriptors(proto),
        )) {
            if (name === 'constructor') continue;
            if (typeof desc.set === 'function') {
                members.add(name);
            }
        }
        proto = Object.getPrototypeOf(proto);
    }

    return members;
}

describe('ViewerState state inventory', () => {
    let state: ViewerState;
    let mutableMembers: Set<string>;
    let byMember: Map<string, StateInventoryEntry>;

    beforeEach(() => {
        state = new ViewerState();
        mutableMembers = getMutableMembers(state);
        byMember = new Map(
            STATE_INVENTORY.map((entry) => [entry.member, entry]),
        );
    });

    it('classifies every mutable member of a constructed ViewerState', () => {
        const unclassified = [...mutableMembers]
            .filter((member) => !byMember.has(member))
            .sort();

        // If this fails, a new mutable ViewerState member was added without a
        // state-inventory.ts entry. Classify it (command | observable |
        // internal | query-only) before CI can pass.
        expect(unclassified).toEqual([]);
    });

    it('contains no stale entries (every entry maps to a real member)', () => {
        const stale = STATE_INVENTORY.map((entry) => entry.member)
            .filter((member) => !mutableMembers.has(member))
            .sort();

        expect(stale).toEqual([]);
    });

    it('has no duplicate member entries', () => {
        expect(byMember.size).toBe(STATE_INVENTORY.length);
    });

    it('lists existing mutation methods for every command member and none otherwise', () => {
        for (const entry of STATE_INVENTORY) {
            if (entry.classification === 'command') {
                expect(
                    entry.commands && entry.commands.length > 0,
                    `command member "${entry.member}" must list at least one mutation method`,
                ).toBe(true);

                for (const method of entry.commands ?? []) {
                    expect(
                        typeof (state as unknown as Record<string, unknown>)[
                            method
                        ],
                        `command "${method}" for member "${entry.member}" must exist on ViewerState`,
                    ).toBe('function');
                }
            } else {
                expect(
                    entry.commands,
                    `non-command member "${entry.member}" must not list mutation methods`,
                ).toBeUndefined();
            }
        }
    });
});
