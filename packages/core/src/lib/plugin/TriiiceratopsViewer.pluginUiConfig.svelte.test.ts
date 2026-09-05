// Core viewer × SDK-plugin CONTRACT test — `config.plugins[uiId]` control and
// the reactive, updatable render target (panel ↔ flyout).
//
// Covers two intertwined guarantees:
//   1. Stable id: an SDK plugin is keyed under `config.plugins` by its `uiId`
//      (or a stable id derived from its name) — NOT a random per-activation id.
//      A consumer can therefore hide the toolbar button (`visible: false`) or
//      open it on mount (`open: true`).
//   2. Updatable target: `config.plugins[uiId].target` decides panel vs flyout
//      rendering and can change AFTER mount (via a new config object), moving
//      the plugin between its docked-panel and anchored-flyout chrome without
//      re-registering.

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definePlugin, type PluginContext } from '@triiiceratops/plugin-sdk';

import TriiiceratopsViewer from '../components/TriiiceratopsViewer.svelte';
import type { SdkPlugin } from '../types/plugin';
import type { ViewerConfig } from '../types/config';
import type { ViewerState } from '../state/viewer.svelte';

const ICON = {
    kind: 'svg',
    inner: '<circle data-double-icon="1" />',
    viewBox: '0 0 1 1',
} as const;

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
}

function makeDouble(config: {
    name: string;
    uiId?: string;
    target?: 'flyout' | 'panel';
}): SdkPlugin {
    const plugin = definePlugin({
        name: config.name,
        uiId: config.uiId,
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: ICON,
        target: config.target ?? 'panel',
        view: {
            mount(container: HTMLElement, _context: PluginContext) {
                container.textContent = 'double-content';
                return () => {};
            },
        },
    });
    return plugin as unknown as SdkPlugin;
}

// happy-dom lacks the Web Animations API used by the docked-panel transitions.
function stubAnimate() {
    if (!('animate' in Element.prototype)) {
        (Element.prototype as unknown as Record<string, unknown>).animate =
            function () {
                const anim: Record<string, unknown> = {
                    onfinish: null,
                    cancel() {},
                    finish() {},
                    finished: Promise.resolve(),
                    playState: 'finished',
                };
                queueMicrotask(() => {
                    const cb = anim.onfinish as
                        | ((...a: unknown[]) => void)
                        | null;
                    if (typeof cb === 'function') cb();
                });
                return anim as unknown as Animation;
            };
    }
}

const NAME = '@triiiceratops/plugin-cfg-double';
const UIID = 'cfg-double';

function buttonByLabel(root: HTMLElement) {
    return root.querySelector<HTMLElement>(`[aria-label="${NAME}"]`);
}

describe('TriiiceratopsViewer × config.plugins[uiId] control + updatable target', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
        stubAnimate();
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('keys an SDK plugin under config.plugins by its stable uiId (visible + open)', async () => {
        const plugin = makeDouble({ name: NAME, uiId: UIID, target: 'panel' });

        const props = $state({
            plugins: [plugin],
            config: { plugins: { [UIID]: { visible: false } } } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Regression guard: config keyed by uiId hides the button.
        expect(buttonByLabel(target)).toBeNull();

        // Flip to visible + open via a new config object (updateConfig path).
        props.config = { plugins: { [UIID]: { visible: true, open: true } } };
        await settle();

        const button = buttonByLabel(target);
        expect(button).not.toBeNull();
        // open: true docked the panel content in the viewer chrome.
        const mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted).not.toBeNull();
        expect(mounted!.closest('[data-panel-id]')).not.toBeNull();

        await unmount(app);
    });

    it('derives a stable id from the package name when no uiId is set', async () => {
        // No uiId → id derived as `triiiceratops-plugin-cfg-double`.
        const plugin = makeDouble({ name: NAME, target: 'panel' });
        const derivedId = 'triiiceratops-plugin-cfg-double';

        const props = $state({
            plugins: [plugin],
            config: {
                plugins: { [derivedId]: { visible: false } },
            } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(buttonByLabel(target)).toBeNull();
        await unmount(app);
    });

    it('renders as a panel or flyout per config.plugins[uiId].target, and switches after mount', async () => {
        const plugin = makeDouble({ name: NAME, uiId: UIID, target: 'panel' });

        const props = $state({
            plugins: [plugin],
            config: { plugins: { [UIID]: { open: true } } } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Panel target: plain toggle (no flyout anchor), content docked.
        let button = buttonByLabel(target);
        expect(button).not.toBeNull();
        expect(button!.hasAttribute('data-flyout-toggle')).toBe(false);
        expect(
            target
                .querySelector(`[data-plugin-name="${NAME}"]`)
                ?.closest('[data-panel-id]'),
        ).not.toBeNull();

        // Switch to flyout AFTER mount, via a new config object.
        props.config = {
            plugins: { [UIID]: { open: true, target: 'flyout' } },
        };
        await settle();

        button = buttonByLabel(target);
        expect(button).not.toBeNull();
        // Now a flyout toggle: it anchors a flyout panel and the content lives
        // inside it, not in a docked panel section.
        expect(button!.hasAttribute('data-flyout-toggle')).toBe(true);
        const mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted).not.toBeNull();
        expect(mounted!.closest('[data-flyout-panel]')).not.toBeNull();
        expect(mounted!.closest('[data-panel-id]')).toBeNull();

        await unmount(app);
    });

    it('docks the panel at config.plugins[uiId].position — left, right, bottom, and overlay — updatably after mount', async () => {
        const plugin = makeDouble({ name: NAME, uiId: UIID, target: 'panel' });

        const props = $state({
            plugins: [plugin],
            config: { plugins: { [UIID]: { open: true } } } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // No position override → authored/registration default of 'left'.
        let mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted!.closest('.side-col-left')).not.toBeNull();

        // Move to the right sidebar column via config, after mount.
        props.config = {
            plugins: { [UIID]: { open: true, position: 'right' } },
        };
        await settle();
        mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted!.closest('.side-col-right')).not.toBeNull();
        expect(mounted!.closest('.side-col-left')).toBeNull();

        // Move to the bottom band.
        props.config = {
            plugins: { [UIID]: { open: true, position: 'bottom' } },
        };
        await settle();
        mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted!.closest('.plugin-bottom')).not.toBeNull();
        expect(mounted!.closest('.side-col-right')).toBeNull();

        // Move to the canvas overlay.
        props.config = {
            plugins: { [UIID]: { open: true, position: 'overlay' } },
        };
        await settle();
        mounted = target.querySelector<HTMLElement>(
            `[data-plugin-name="${NAME}"]`,
        );
        expect(mounted!.closest('.plugin-overlay')).not.toBeNull();
        expect(mounted!.closest('.plugin-bottom')).toBeNull();

        await unmount(app);
    });
});
