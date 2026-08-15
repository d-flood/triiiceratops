/**
 * Plugin conformance suite.
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 */

import {
    collectIncompatibilities,
    definePlugin,
    type PluginContext,
    type PluginHost,
    type PublishedState,
} from '@triiiceratops/plugin-sdk';
import {
    conformanceCases,
    createTestViewerContext,
    runPluginConformance,
} from '@triiiceratops/plugin-sdk/testing';
import { CORE_VERSION, capabilities, pluginApiVersion } from 'triiiceratops';
import { describe, expect, it } from 'vitest';

import { catalog } from './catalog';
import { AvPlugin } from './plugin';

runPluginConformance(() => AvPlugin);

type DeclaredHost = Pick<
    PluginHost,
    'coreVersion' | 'pluginApiVersion' | 'capabilities'
>;

/** A host declaring `declared`, over otherwise real services. */
function hostDeclaring(declared: DeclaredHost): PluginHost {
    const tc = createTestViewerContext({ uiId: 'av' });
    return {
        container: document.createElement('div'),
        viewerState: tc.viewerState,
        styles: tc.styles,
        locale: tc.locale,
        ui: tc.ui,
        surface: tc.surface,
        reportError: () => {},
        ...declared,
    };
}

const THIS_CORE: DeclaredHost = {
    coreVersion: CORE_VERSION,
    pluginApiVersion,
    capabilities,
};

function refusalsAgainst(declared: Partial<DeclaredHost>): string[] {
    return collectIncompatibilities(
        AvPlugin,
        hostDeclaring({ ...THIS_CORE, ...declared }),
    ).map((reason) => reason.required);
}

describe('declared compatibility', () => {
    // A typo'd `title` key renders verbatim in the toolbar — the exact cosmetic
    // bug key-or-literal resolution exists to fix.
    it('declares a title that resolves against this plugin catalog', () => {
        expect(AvPlugin.title).toBeTruthy();
        expect(catalog.en?.[AvPlugin.title!]).toBeTruthy();
    });

    it('activates on the core this repository builds', () => {
        expect(
            collectIncompatibilities(AvPlugin, hostDeclaring(THIS_CORE)),
        ).toEqual([]);
    });

    // Without these the plugin activates on a core with no claim seam and renders
    // its stages on top of an unsupported-content placard it cannot suppress; or
    // on a core with no shared Svelte runtime and no curated utilities to
    // consume — of neither of which its IIFE carries a copy; or on a core with
    // nowhere to register playback controls, which would stage a recording and
    // leave a reader no way to play it.
    it('requires the seams it cannot work without', () => {
        expect(AvPlugin.requiredCapabilities).toEqual([
            'canvas-claim',
            'shared-svelte-runtime',
            'shared-core-utils',
            'transport-chrome',
        ]);
    });

    it('is refused by a core that renders no transport chrome', () => {
        expect(
            refusalsAgainst({
                capabilities: capabilities.filter(
                    (name) => name !== 'transport-chrome',
                ),
            }),
        ).toContain('transport-chrome');
    });

    it('is refused by a core that shares no Svelte runtime', () => {
        expect(
            refusalsAgainst({
                capabilities: capabilities.filter(
                    (name) => name !== 'shared-svelte-runtime',
                ),
            }),
        ).toContain('shared-svelte-runtime');
    });

    it('is refused by a core that shares no core utilities', () => {
        expect(
            refusalsAgainst({
                capabilities: capabilities.filter(
                    (name) => name !== 'shared-core-utils',
                ),
            }),
        ).toContain('shared-core-utils');
    });

    /**
     * `svelte/internal` is private API with no semver guarantee, so an upper
     * bound is not optional: a `>=` range is satisfied by a core 2.0 on a later
     * Svelte, whose compiled components would call helpers that had moved. The
     * pin must be re-stamped at each core release — nothing in the release
     * tooling stamps it, which is what this assertion stands in for.
     */
    it('pins core exactly, so a future major cannot satisfy it', () => {
        expect(AvPlugin.coreRange).toBe(CORE_VERSION);
        expect(refusalsAgainst({ coreVersion: '2.0.0' })).toContain(
            CORE_VERSION,
        );
    });
});

/**
 * The classification gate, exercised in both directions.
 *
 * A conformance suite that cannot fail proves nothing, and this one's
 * published-state checks became load-bearing the moment this plugin started
 * publishing `AVState`. So the same case that the real plugin passes above is
 * run here against a plugin publishing an AVState-shaped state with one member
 * misclassified, and is required to reject it.
 */
describe('the published-state classification gate bites', () => {
    const CLASSIFICATION_CASE = conformanceCases.find((c) =>
        c.name.startsWith('classifies every member'),
    )!;

    /** An AVState-shaped publication whose `seek` carries a made-up classification. */
    function misclassifiedAvPlugin() {
        return definePlugin({
            name: '@triiiceratops/plugin-av-misclassified-fixture',
            uiId: 'av-misclassified',
            version: '0.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            icon: AvPlugin.icon,
            target: 'panel',
            view: {
                mount(_container: HTMLElement, context: PluginContext) {
                    const published = {
                        stateInventory: {
                            play: 'command',
                            // BUG: `mutator` is not one of the three.
                            seek: 'mutator',
                            paused: 'observable',
                        },
                        play: () => {},
                        seek: () => {},
                        paused: true,
                        subscribe: () => () => {},
                        subscribeFrame: () => () => {},
                    };
                    context.publishState(
                        published as unknown as PublishedState,
                    );
                    return () => {};
                },
            },
        });
    }

    it('accepts this plugin’s AVState classification', async () => {
        await expect(
            CLASSIFICATION_CASE.run(() => AvPlugin),
        ).resolves.toBeUndefined();
    });

    it('rejects an AVState-shaped state with a misclassified command', async () => {
        await expect(
            CLASSIFICATION_CASE.run(() => misclassifiedAvPlugin()),
        ).rejects.toThrow(/classification/i);
    });
});
