import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import { ViewerState } from './viewer.svelte';
import { manifestsState } from './manifests.svelte';
import type { IconDescriptor } from '../types/plugin';
import {
    REACTIVE_COLLECTION_MEMBERS,
    STATE_INVENTORY,
    type StateInventoryEntry,
} from './state-inventory';

vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
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
 * Getter-only accessors (query getters like `manifestEntry`, `hasNext`) and
 * methods are intentionally excluded: they are not mutable members.
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

    // These four members are declared as plain `Set`/`Map` so that
    // `svelte/reactivity` stays out of core's published declarations. The type
    // system therefore no longer guards them, and a plain collection would stop
    // notifying subscribers; the inventory owns the invariant instead.
    it('holds reactive collections for every inventoried reactive-collection member', () => {
        for (const member of REACTIVE_COLLECTION_MEMBERS) {
            const value = (state as unknown as Record<string, unknown>)[member];

            expect(
                value instanceof SvelteSet || value instanceof SvelteMap,
                `"${member}" must hold a SvelteSet/SvelteMap (see REACTIVE_COLLECTION_MEMBERS)`,
            ).toBe(true);
        }
    });

    it('inventories every reactive-collection member', () => {
        for (const member of REACTIVE_COLLECTION_MEMBERS) {
            expect(
                byMember.has(member),
                `"${member}" must have a state-inventory entry`,
            ).toBe(true);
        }
    });
});

// ============================================================================
// Ticket 04 — subscription capability matrix (ADR 0008)
//
// Extends the inventory test: for every `command`/`observable` member, drive an
// actual change and assert the framework-neutral `subscribe` listener is woken
// exactly once by the next flush. `internal`/`query-only` members must never
// notify. The matrix's required-member set is derived from the same inventory as
// the watcher, so a new member cannot be added without either classifying it or
// giving it a scenario here.
// ============================================================================

const noopIcon: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

/** Minimal plugin chrome registration; the matrix only needs the state change. */
function registerChrome(
    state: ViewerState,
    target: 'panel' | 'flyout' = 'panel',
): void {
    state.registerSdkChrome({
        id: 'P',
        name: 'P',
        icon: noopIcon,
        target,
        dismiss: 'light',
        mount: () => () => {},
    });
}

/**
 * Read a member as the watcher observes it: reactive collections notify on size
 * (and version) changes, so compare by size; everything else compares by
 * identity/value.
 */
function readValue(state: ViewerState, member: string): unknown {
    const value = (state as unknown as Record<string, unknown>)[member];
    if (value instanceof SvelteSet || value instanceof SvelteMap) {
        return value.size;
    }
    return value;
}

/**
 * Raw IIIF v3 manifest JSON, used wherever a scenario needs a manifest to be
 * present. It is raw JSON on purpose: this file mocks the manifest cache
 * because its subject is state classification, not parsing, but the values that
 * cache hands back must still be the shapes the real one produces. It used to
 * hand back `manifesto.js`-shaped doubles carrying `getBehavior` and
 * `getSequences`, which is the abstraction the `remove-manifesto` epic removes
 * (ticket 08).
 */
const MANIFEST_JSON = {
    id: 'manifest-1',
    type: 'Manifest',
    label: { en: ['State inventory fixture'] },
    behavior: ['individuals'],
    items: [
        {
            id: 'canvas-1',
            type: 'Canvas',
            label: { en: ['Canvas 1'] },
            width: 800,
            height: 1000,
        },
    ],
};

function resetManifestMocks(): void {
    vi.mocked(manifestsState.fetchManifest).mockReset();
    vi.mocked(manifestsState.fetchResource).mockReset();
    vi.mocked(manifestsState.registerManifest).mockReset();
    vi.mocked(manifestsState.getManifestEntry)
        .mockReset()
        .mockReturnValue(undefined);
    vi.mocked(manifestsState.getAnnotations).mockReset().mockReturnValue([]);
    vi.mocked(manifestsState.getCanvases).mockReset().mockReturnValue([]);
    vi.mocked(manifestsState.getSequenceCount).mockReset().mockReturnValue(0);
}

interface CapabilityScenario {
    member: string;
    /** Precondition applied before subscribing (its changes are not counted). */
    setup?: (state: ViewerState) => void | Promise<void>;
    /** The change under test, applied after subscribing. */
    act: (state: ViewerState) => void | Promise<void>;
}

const commandScenarios: CapabilityScenario[] = [
    {
        member: 'manifestId',
        setup: () => {
            vi.mocked(manifestsState.getManifestEntry).mockReturnValue({
                json: MANIFEST_JSON,
                isFetching: false,
            });
            vi.mocked(manifestsState.getCanvases).mockReturnValue([
                ...MANIFEST_JSON.items,
            ]);
        },
        act: (state) => state.setManifestData('manifest-1', MANIFEST_JSON),
    },
    { member: 'canvasId', act: (state) => state.setCanvas('canvas-1') },
    {
        member: 'selectedSequenceIndex',
        setup: (state) => {
            // sequenceCount reads the mock only when a manifest is active.
            vi.mocked(manifestsState.getSequenceCount).mockReturnValue(3);
            state.manifestId = 'manifest-1';
        },
        act: (state) => state.setSequenceIndex(1),
    },
    {
        member: 'initialCanvasRegion',
        act: (state) =>
            state.setInitialCanvasRegion({
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            }),
    },
    {
        member: 'selectedChoices',
        act: (state) => state.selectChoice('canvas-1', 'choice-1'),
    },
    { member: 'showAnnotations', act: (state) => state.toggleAnnotations() },
    {
        member: 'showThumbnailGallery',
        act: (state) => state.toggleThumbnailGallery(),
    },
    {
        member: 'galleryExpanded',
        act: (state) => state.toggleGalleryExpanded(),
    },
    { member: 'toolbarOpen', act: (state) => state.toggleToolbar() },
    {
        member: 'showMetadataPanel',
        act: (state) => state.toggleMetadataPanel(),
    },
    { member: 'showCanvasInfo', act: (state) => state.toggleCanvasInfo() },
    {
        member: 'showStructuresPanel',
        act: (state) => state.toggleStructuresPanel(),
    },
    {
        member: 'showCollectionPanel',
        act: (state) => state.toggleCollectionPanel(),
    },
    { member: 'showSearchPanel', act: (state) => state.toggleSearchPanel() },
    {
        member: 'visibleAnnotationIds',
        act: (state) => state.setAnnotationVisible('anno-1', true),
    },
    {
        member: 'annotationVisibilityTouched',
        act: (state) => state.setAnnotationVisible('anno-1', true),
    },
    {
        member: 'hoveredAnnotationId',
        act: (state) => state.setHoveredAnnotationId('anno-1'),
    },
    {
        member: 'userAnnotations',
        act: (state) =>
            state.setUserAnnotations('manifest-1', 'canvas-1', [
                { id: 'user-anno-1' },
            ]),
    },
    { member: 'viewingMode', act: (state) => state.setViewingMode('paged') },
    {
        member: 'viewingDirection',
        act: (state) =>
            state.updateConfig({ viewingDirection: 'right-to-left' }),
    },
    { member: 'pagedOffset', act: (state) => state.togglePagedOffset() },
    {
        member: 'config',
        act: (state) => state.updateConfig({ toolbarOpen: true }),
    },
    {
        member: 'searchProvider',
        act: (state) => state.setSearchProvider(async () => []),
    },
    {
        member: 'manifestRequestConfig',
        act: (state) =>
            state.setManifestRequestConfig({ headers: { 'x-test': '1' } }),
    },
    { member: 'searchQuery', act: (state) => state.search('hello') },
    {
        member: 'galleryPosition',
        act: (state) => state.setGalleryPosition({ x: 1, y: 2 }),
    },
    {
        member: 'gallerySize',
        act: (state) => state.setGallerySize({ width: 1, height: 2 }),
    },
    { member: 'dockSide', act: (state) => state.setDockSide('right') },
    {
        member: 'isGalleryDockedBottom',
        act: (state) => state.setDockSide('bottom'),
    },
    {
        member: 'isGalleryDockedRight',
        act: (state) => state.setDockSide('right'),
    },
    {
        member: 'pluginMenuButtons',
        act: (state) => registerChrome(state),
    },
    {
        member: 'pluginPanels',
        act: (state) => registerChrome(state),
    },
    {
        member: 'pluginFlyouts',
        act: (state) => registerChrome(state, 'flyout'),
    },
    {
        member: 'pluginUiState',
        // Registration adds the plugin's UI-state entry — a size change, which
        // is what `readValue` compares for a reactive collection. Open/close is a
        // same-key value swap, so it is invisible to this matrix's size
        // comparison; `plugin/surface.test.ts` asserts that those swaps notify
        // (the channel a plugin's `PluginSurface.isOpen` depends on).
        act: (state) => registerChrome(state),
    },
];

const observableScenarios: CapabilityScenario[] = [
    {
        member: 'searchResults',
        act: (state) => {
            state.searchResults = [
                { canvasIndex: 0, canvasLabel: 'l', hits: [] },
            ];
        },
    },
    {
        member: 'searchAnnotations',
        act: (state) => {
            state.searchAnnotations = [{ id: 'hit-1', canvasId: 'canvas-1' }];
        },
    },
    {
        member: 'isSearching',
        act: (state) => {
            state.isSearching = true;
        },
    },
    {
        member: 'collectionId',
        act: (state) => {
            state.collectionId = 'collection-1';
        },
    },
    {
        member: 'collectionLabel',
        act: (state) => {
            state.collectionLabel = 'Collection';
        },
    },
    {
        member: 'collectionThumbnail',
        act: (state) => {
            state.collectionThumbnail = 'thumb.jpg';
        },
    },
    {
        member: 'collectionItems',
        act: (state) => {
            state.collectionItems = [
                { id: 'm1', type: 'Manifest', label: 'M1' },
            ];
        },
    },
    {
        member: 'isFullScreen',
        act: (state) => {
            state.isFullScreen = true;
        },
    },
    {
        member: 'tileSourceError',
        act: (state) => {
            state.tileSourceError = { type: 'auth' };
        },
    },
    {
        member: 'osdViewer',
        act: (state) =>
            state.notifyOSDReady({} as unknown as OpenSeadragon.Viewer),
    },
    {
        member: 'loadedManifestIds',
        // Simulate core marking a manifest ready (private markManifestReady adds
        // to this set at manifest-load completion).
        act: (state) => {
            state.loadedManifestIds.add('manifest-1');
        },
    },
    {
        member: 'activeLocale',
        // Core mirrors the resolved active locale onto this field (as it does for
        // other external facts like isFullScreen); a direct write drives the
        // observable notification. Default is the page locale ('en' in tests).
        act: (state) => {
            state.activeLocale = 'de';
        },
    },
];

describe('ViewerState subscription capability matrix', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetManifestMocks();
        // Isolate throwing-listener noise / catch unexpected console.error.
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    async function runScenario(scenario: CapabilityScenario) {
        const state = new ViewerState();
        await scenario.setup?.(state);
        await tick();

        const before = readValue(state, scenario.member);
        const listener = vi.fn();
        const unsubscribe = state.subscribe(listener);

        await scenario.act(state);
        await tick();

        const after = readValue(state, scenario.member);
        unsubscribe();
        state.destroy();

        return { listener, before, after };
    }

    it('drives every command and observable inventory member', () => {
        const required = STATE_INVENTORY.filter(
            (entry) =>
                entry.classification === 'command' ||
                entry.classification === 'observable',
        ).map((entry) => entry.member);
        const covered = new Set(
            [...commandScenarios, ...observableScenarios].map((s) => s.member),
        );

        const missing = required.filter((m) => !covered.has(m)).sort();
        expect(missing).toEqual([]);

        // No scenario may target an internal/query-only member (drift guard).
        const watched = new Set(required);
        const wrong = [...commandScenarios, ...observableScenarios]
            .map((s) => s.member)
            .filter((m) => !watched.has(m))
            .sort();
        expect(wrong).toEqual([]);
    });

    for (const scenario of commandScenarios) {
        it(`notifies exactly once when command member "${scenario.member}" changes`, async () => {
            const { listener, before, after } = await runScenario(scenario);
            expect(before, `${scenario.member} should change`).not.toBe(after);
            expect(listener).toHaveBeenCalledTimes(1);
            expect(errorSpy).not.toHaveBeenCalled();
        });
    }

    for (const scenario of observableScenarios) {
        it(`notifies exactly once when observable member "${scenario.member}" changes`, async () => {
            const { listener, before, after } = await runScenario(scenario);
            expect(before, `${scenario.member} should change`).not.toBe(after);
            expect(listener).toHaveBeenCalledTimes(1);
            expect(errorSpy).not.toHaveBeenCalled();
        });
    }

    it('never notifies when an internal member changes (exclusion)', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        // Public `internal`-classified members: no plugin-facing contract.
        state.startCanvasId = 'canvas-x';
        state.isGalleryDragging = true;
        state.dragOverSide = 'left';
        await tick();

        expect(listener).not.toHaveBeenCalled();
        state.destroy();
    });

    it('has no query-only members to notify (kept out of the flush by design)', () => {
        // Query-only members are readable on demand but never notify. There are
        // none today; if one is added it must be driven here and asserted to NOT
        // notify (like the internal-exclusion case above).
        const queryOnly = STATE_INVENTORY.filter(
            (entry) => entry.classification === 'query-only',
        );
        expect(queryOnly).toEqual([]);
    });
});

describe('ViewerState subscribe semantics', () => {
    beforeEach(() => {
        resetManifestMocks();
    });

    it('batches many changes in one tick into a single notification', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        state.toggleToolbar();
        state.toggleMetadataPanel();
        await tick();

        expect(listener).toHaveBeenCalledTimes(1);
        state.destroy();
    });

    it('calls listeners in registration order', async () => {
        const state = new ViewerState();
        const calls: number[] = [];
        state.subscribe(() => calls.push(1));
        state.subscribe(() => calls.push(2));
        state.subscribe(() => calls.push(3));

        state.toggleToolbar();
        await tick();

        expect(calls).toEqual([1, 2, 3]);
        state.destroy();
    });

    it('does not notify when a command results in identical state', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        // hoveredAnnotationId is already null; setting it to null is a no-op.
        state.setHoveredAnnotationId(null);
        await tick();

        expect(listener).not.toHaveBeenCalled();
        state.destroy();
    });

    it('notifies on unsupported direct field assignment (escape hatch)', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        state.toolbarOpen = true;
        await tick();

        expect(listener).toHaveBeenCalledTimes(1);
        state.destroy();
    });

    it('delivers asynchronously; reads are synchronously current', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        state.toggleToolbar();
        // Read is already up to date, but the listener has not fired yet.
        expect(state.toolbarOpen).toBe(true);
        expect(listener).not.toHaveBeenCalled();

        await tick();
        expect(listener).toHaveBeenCalledTimes(1);
        state.destroy();
    });

    it('stops notifying after unsubscribe', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        const unsubscribe = state.subscribe(listener);

        unsubscribe();
        state.toggleToolbar();
        await tick();

        expect(listener).not.toHaveBeenCalled();
        state.destroy();
    });

    it('isolates a throwing listener so others still run', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const state = new ViewerState();
        const after = vi.fn();

        state.subscribe(() => {
            throw new Error('boom');
        });
        state.subscribe(after);

        state.toggleToolbar();
        await tick();

        expect(after).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalled();

        state.destroy();
        errorSpy.mockRestore();
    });

    it('delivers no notifications and no errors after destroy (teardown)', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        state.destroy();
        state.toggleToolbar();
        await tick();

        expect(listener).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('isolates subscribers across viewer instances', async () => {
        const first = new ViewerState();
        const second = new ViewerState();
        const firstListener = vi.fn();
        const secondListener = vi.fn();
        first.subscribe(firstListener);
        second.subscribe(secondListener);

        first.toggleToolbar();
        await tick();

        expect(firstListener).toHaveBeenCalledTimes(1);
        expect(secondListener).not.toHaveBeenCalled();

        first.destroy();
        second.destroy();
    });
});

// ============================================================================
// Ticket 05 — per-viewer display state and manifest queries (ADR 0007)
// ============================================================================

describe('ViewerState per-viewer display state (ticket 05)', () => {
    beforeEach(() => {
        resetManifestMocks();
    });

    it('scopes user annotations to the viewer they were synced into', () => {
        const withAnnotations = new ViewerState();
        const other = new ViewerState();

        withAnnotations.setUserAnnotations('manifest-1', 'canvas-1', [
            { id: 'user-anno-1' },
        ]);

        // The owning viewer sees them (merged, origin-tagged); the other stays
        // empty — annotations never leak between viewers on one page.
        expect(
            withAnnotations.getUserAnnotations('manifest-1', 'canvas-1'),
        ).toHaveLength(1);
        const merged = withAnnotations.getAnnotations('manifest-1', 'canvas-1');
        expect(
            merged.some(
                (a: any) =>
                    a.id === 'user-anno-1' &&
                    a.__triiiceratopsAnnotationOrigin === 'user',
            ),
        ).toBe(true);

        expect(other.getUserAnnotations('manifest-1', 'canvas-1')).toEqual([]);
        expect(other.getAnnotations('manifest-1', 'canvas-1')).toEqual([]);

        withAnnotations.destroy();
        other.destroy();
    });

    it('clearUserAnnotations only affects the owning viewer', () => {
        const state = new ViewerState();
        state.setUserAnnotations('manifest-1', 'canvas-1', [{ id: 'a' }]);
        state.clearUserAnnotations('manifest-1', 'canvas-1');
        expect(state.getUserAnnotations('manifest-1', 'canvas-1')).toEqual([]);
        state.destroy();
    });

    it('notifies subscribers and reports readiness when a manifest loads', async () => {
        vi.mocked(manifestsState.getManifestEntry).mockReturnValue({
            json: MANIFEST_JSON,
            isFetching: false,
        });
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            ...MANIFEST_JSON.items,
        ]);

        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        expect(state.isManifestReady('manifest-1')).toBe(false);

        await state.setManifestData('manifest-1', MANIFEST_JSON);
        await tick();

        expect(state.isManifestReady('manifest-1')).toBe(true);
        expect(listener).toHaveBeenCalled();

        state.destroy();
    });
});
