// Core viewer × SDK-plugin CONTRACT test — the primary seam for the
// core-owned-chrome path (epic restore-plugin-toolbar-chrome, ticket 02).
//
// Mounts the REAL viewer chrome with a TEST-DOUBLE SDK plugin (`definePlugin`)
// and asserts external behavior only:
//   - the button renders among the toolbar plugin buttons, from `meta.icon`;
//   - opening mounts the double's content into an anchored (flyout) / docked
//     (panel) container, and closing unmounts it;
//   - `dismiss: 'explicit'` is NOT dismissed by an outside pointer-down, while
//     `'light'` is;
//   - a double whose activation throws renders NO button and emits `pluginerror`
//     (DOM event + host callback) with no user-facing error UI.
//
// Lifecycle note: core mounts the plugin's content-only element once per
// Activation and places it into the open surface (removing it on close); the
// mount cleanup runs on deactivation. Per-viewer Activation state therefore
// survives close→reopen (required by the image-manipulation Flyout, ticket 03).

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definePlugin, type PluginContext } from '@triiiceratops/plugin-sdk';

import TriiiceratopsViewer from '../components/TriiiceratopsViewer.svelte';
import type {
    LocaleCatalog,
    PluginDef,
    PluginError,
    SdkPlugin,
} from '../types/plugin';
import type { ViewerConfig } from '../types/config';
import type { ViewerState } from '../state/viewer.svelte';

vi.mock('openseadragon', () => ({
    default: Object.assign(
        vi.fn(() => ({
            addHandler: vi.fn(),
            removeHandler: vi.fn(),
            removeAllHandlers: vi.fn(),
            destroy: vi.fn(),
            open: vi.fn(),
            close: vi.fn(),
            forceRedraw: vi.fn(),
            setMouseNavEnabled: vi.fn(),
            addOverlay: vi.fn(),
            removeOverlay: vi.fn(),
            clearOverlays: vi.fn(),
            viewport: {
                getZoom: vi.fn(() => 1),
                getMaxZoom: vi.fn(() => 10),
                getMinZoom: vi.fn(() => 0.1),
                zoomTo: vi.fn(),
                zoomBy: vi.fn(),
                panTo: vi.fn(),
                goHome: vi.fn(),
                fitBounds: vi.fn(),
                getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
            },
            world: {
                getItemCount: vi.fn(() => 0),
                getItemAt: vi.fn(),
                addHandler: vi.fn(),
                removeHandler: vi.fn(),
            },
            drawer: { canvas: null },
            container: null,
            element: null,
        })),
        { Rect: vi.fn(), Point: vi.fn(), ControlAnchor: {} },
    ),
}));

// A recognizable inner-SVG marker so we can assert the button icon is rendered
// from `meta.icon` (core's `PluginIcon` injects the descriptor's inner markup).
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

interface Capture {
    container: HTMLElement | null;
    mounts: number;
    cleanups: number;
}

function makeDouble(config: {
    name: string;
    target: 'flyout' | 'panel';
    dismiss?: 'light' | 'explicit';
    throwOnMount?: boolean;
    capture?: Capture;
    title?: string;
    catalog?: LocaleCatalog;
}): SdkPlugin {
    const plugin = definePlugin({
        name: config.name,
        title: config.title,
        catalog: config.catalog,
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: ['osd@5'],
        icon: ICON,
        target: config.target,
        dismiss: config.dismiss,
        view: {
            mount(container: HTMLElement, _context: PluginContext) {
                if (config.throwOnMount) throw new Error('mount boom');
                if (config.capture) {
                    config.capture.container = container;
                    config.capture.mounts++;
                }
                container.textContent = 'double-content';
                return () => {
                    if (config.capture) config.capture.cleanups++;
                };
            },
        },
    });
    return plugin as unknown as SdkPlugin;
}

// happy-dom has no Web Animations API; the docked-panel path animates
// (transition:fly / animate:flip / slideWidth). Stub `animate` with an
// immediately-finishing animation so outros complete and nodes unmount.
function stubAnimate() {
    if (!('animate' in Element.prototype)) {
        (Element.prototype as unknown as Record<string, unknown>).animate =
            function () {
                const anim: Record<string, unknown> = {
                    onfinish: null,
                    oncancel: null,
                    cancel() {},
                    finish() {},
                    pause() {},
                    play() {},
                    finished: Promise.resolve(),
                    currentTime: 0,
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

describe('TriiiceratopsViewer core-owned-chrome SDK plugins', () => {
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

    it('renders a toolbar button from meta.icon and mounts flyout content on open / unmounts on close', async () => {
        const capture: Capture = { container: null, mounts: 0, cleanups: 0 };
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-flyout-double',
            target: 'flyout',
            dismiss: 'explicit',
            capture,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Button renders among the toolbar plugin buttons, from meta.icon.
        const button = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="@triiiceratops/plugin-flyout-double"]',
        );
        expect(button).not.toBeNull();
        expect(button!.querySelector('[data-double-icon]')).not.toBeNull();

        // Content is mounted once at activation but not yet placed in the closed
        // flyout.
        expect(capture.mounts).toBe(1);
        expect(button!.getAttribute('aria-expanded')).toBe('false');
        expect(
            target.querySelector(
                '[data-plugin-name="@triiiceratops/plugin-flyout-double"]',
            ),
        ).toBeNull();

        // Open: the content-only element is placed into the anchored flyout
        // (the flyout panel the button controls).
        button!.click();
        await settle();
        expect(button!.getAttribute('aria-expanded')).toBe('true');
        const mounted = target.querySelector<HTMLElement>(
            '[data-plugin-name="@triiiceratops/plugin-flyout-double"]',
        );
        expect(mounted).not.toBeNull();
        expect(mounted!.textContent).toBe('double-content');
        expect(mounted).toBe(capture.container);
        const panelId = button!.getAttribute('aria-controls');
        expect(mounted!.closest('[data-flyout-panel]')?.id).toBe(panelId);

        // Close: the content unmounts from the anchored flyout.
        button!.click();
        await settle();
        expect(button!.getAttribute('aria-expanded')).toBe('false');
        expect(
            target.querySelector(
                '[data-plugin-name="@triiiceratops/plugin-flyout-double"]',
            ),
        ).toBeNull();

        // The mount cleanup runs on deactivation (viewer unmount), not on close —
        // Activation-scoped state survives close→reopen.
        expect(capture.cleanups).toBe(0);
        await unmount(app);
        expect(capture.cleanups).toBe(1);
    });

    it('mounts panel content into a docked panel on open and unmounts on close', async () => {
        const capture: Capture = { container: null, mounts: 0, cleanups: 0 };
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-panel-double',
            target: 'panel',
            capture,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            'button[aria-label="@triiiceratops/plugin-panel-double"]',
        );
        expect(button).not.toBeNull();
        expect(button!.querySelector('[data-double-icon]')).not.toBeNull();

        // Closed: no docked panel content yet.
        expect(
            target.querySelector(
                '[data-plugin-name="@triiiceratops/plugin-panel-double"]',
            ),
        ).toBeNull();

        // Open: content docks in the viewer chrome (a panel section).
        button!.click();
        await settle();
        const mounted = target.querySelector<HTMLElement>(
            '[data-plugin-name="@triiiceratops/plugin-panel-double"]',
        );
        expect(mounted).not.toBeNull();
        expect(mounted!.textContent).toBe('double-content');
        expect(mounted!.closest('[data-panel-id]')).not.toBeNull();

        // Close: content unmounts.
        button!.click();
        await settle();
        expect(
            target.querySelector(
                '[data-plugin-name="@triiiceratops/plugin-panel-double"]',
            ),
        ).toBeNull();

        await unmount(app);
    });

    it('honors dismiss: an outside pointer-down closes a light flyout but not an explicit one', async () => {
        const light = makeDouble({
            name: '@triiiceratops/plugin-light',
            target: 'flyout',
            dismiss: 'light',
        });
        const explicit = makeDouble({
            name: '@triiiceratops/plugin-explicit',
            target: 'flyout',
            dismiss: 'explicit',
        });

        const props = $state({
            plugins: [light, explicit],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const lightBtn = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="@triiiceratops/plugin-light"]',
        );
        const explicitBtn = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="@triiiceratops/plugin-explicit"]',
        );
        expect(lightBtn).not.toBeNull();
        expect(explicitBtn).not.toBeNull();

        // Open both.
        lightBtn!.click();
        explicitBtn!.click();
        await settle();
        expect(lightBtn!.getAttribute('aria-expanded')).toBe('true');
        expect(explicitBtn!.getAttribute('aria-expanded')).toBe('true');

        // Outside pointer-down (bubbles to the window light-dismiss listener).
        document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, composed: true }),
        );
        await settle();

        // Light flyout dismissed; explicit flyout stays open.
        expect(lightBtn!.getAttribute('aria-expanded')).toBe('false');
        expect(explicitBtn!.getAttribute('aria-expanded')).toBe('true');

        await unmount(app);
    });

    it('fails closed: a throwing activation renders no button, emits pluginerror on both channels, and shows no error UI; other plugins keep running', async () => {
        const failing = makeDouble({
            name: '@triiiceratops/plugin-boom',
            target: 'flyout',
            throwOnMount: true,
        });
        const healthy = makeDouble({
            name: '@triiiceratops/plugin-ok',
            target: 'flyout',
        });

        const eventPayloads: PluginError[] = [];
        target.addEventListener('pluginerror', (e) => {
            eventPayloads.push((e as CustomEvent<PluginError>).detail);
        });
        const callbackPayloads: PluginError[] = [];

        const props = $state({
            plugins: [failing, healthy],
            viewerState: undefined as ViewerState | undefined,
            onpluginerror: (error: PluginError) => callbackPayloads.push(error),
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // No button for the failing plugin (fail closed).
        expect(
            target.querySelector('[aria-label="@triiiceratops/plugin-boom"]'),
        ).toBeNull();

        // Both channels fired the SAME payload once, attributed + phased.
        expect(eventPayloads).toHaveLength(1);
        expect(callbackPayloads).toHaveLength(1);
        expect(eventPayloads[0]).toBe(callbackPayloads[0]);
        expect(eventPayloads[0].pluginName).toBe('@triiiceratops/plugin-boom');
        expect(eventPayloads[0].phase).toBe('mount');
        expect(typeof eventPayloads[0].retry).toBe('function');

        // No user-facing error UI anywhere.
        expect(target.querySelector('[data-plugin-error-button]')).toBeNull();
        expect(target.querySelector('[data-plugin-error-rail]')).toBeNull();

        // Isolation: the healthy plugin still renders its button.
        expect(
            target.querySelector('[aria-label="@triiiceratops/plugin-ok"]'),
        ).not.toBeNull();

        await unmount(app);
    });

    // ── PluginContext.surface — open/close awareness ─────────────────────────
    //
    // Core mounts the plugin ONCE (asserted above: `capture.mounts` stays 1
    // across close→reopen), so a plugin cannot learn open/close from its mount
    // lifecycle the way a legacy `PluginDef` component did. It learns it from
    // `context.surface`. These are the end-to-end guards: a real toolbar button
    // press in the real viewer chrome must reach the plugin's subscription.

    /** A double that records every `surface.isOpen` value it observes. */
    function makeSurfaceDouble(config: {
        name: string;
        target: 'flyout' | 'panel';
        seen: boolean[];
        surfaceRef?: { current: PluginContext['surface'] | null };
    }): SdkPlugin {
        const plugin = definePlugin({
            name: config.name,
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: ['osd@5'],
            icon: ICON,
            target: config.target,
            dismiss: 'explicit',
            view: {
                mount(container: HTMLElement, context: PluginContext) {
                    if (config.surfaceRef) {
                        config.surfaceRef.current = context.surface;
                    }
                    // Exactly how a plugin is meant to consume it: project the
                    // surface through the memoized selector runtime, so the
                    // equality gate collapses unrelated viewer changes.
                    const open = context.selectors.select(
                        () => context.surface.isOpen,
                    );
                    config.seen.push(open.get());
                    container.textContent = 'surface-content';
                    return open.subscribe((isOpen) => {
                        config.seen.push(isOpen);
                    });
                },
            },
        });
        return plugin as unknown as SdkPlugin;
    }

    it('tells a plugin when its flyout opens and closes from the toolbar button', async () => {
        const seen: boolean[] = [];
        const surfaceRef: { current: PluginContext['surface'] | null } = {
            current: null,
        };
        const plugin = makeSurfaceDouble({
            name: '@triiiceratops/plugin-surface-flyout',
            target: 'flyout',
            seen,
            surfaceRef,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Mounted closed: the plugin's first read reflects a closed surface, and
        // its surface knows its own chrome id and authored target.
        expect(seen).toEqual([false]);
        expect(surfaceRef.current?.id).toBe(
            'triiiceratops-plugin-surface-flyout',
        );
        expect(surfaceRef.current?.target).toBe('flyout');

        const button = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="@triiiceratops/plugin-surface-flyout"]',
        );
        expect(button).not.toBeNull();

        // Open via the real toolbar button — the path that used to notify nobody.
        button!.click();
        await settle();
        expect(seen).toEqual([false, true]);
        expect(surfaceRef.current?.isOpen).toBe(true);

        // Close via the same button.
        button!.click();
        await settle();
        expect(seen).toEqual([false, true, false]);
        expect(surfaceRef.current?.isOpen).toBe(false);

        await unmount(app);
    });

    it('tells a plugin when its docked panel opens and closes', async () => {
        const seen: boolean[] = [];
        const plugin = makeSurfaceDouble({
            name: '@triiiceratops/plugin-surface-panel',
            target: 'panel',
            seen,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            'button[aria-label="@triiiceratops/plugin-surface-panel"]',
        );
        expect(button).not.toBeNull();
        expect(seen).toEqual([false]);

        button!.click();
        await settle();
        expect(seen).toEqual([false, true]);

        button!.click();
        await settle();
        expect(seen).toEqual([false, true, false]);

        await unmount(app);
    });

    it('reports the surface already open when the consumer configured it open', async () => {
        // `config.plugins[uiId].open` is applied before the plugin mounts, so the
        // plugin's FIRST read is already `true` — it never sees a spurious
        // closed→open transition on startup.
        const seen: boolean[] = [];
        const plugin = makeSurfaceDouble({
            name: '@triiiceratops/plugin-surface-preopened',
            target: 'panel',
            seen,
        });

        const props = $state({
            plugins: [plugin],
            config: {
                plugins: {
                    'triiiceratops-plugin-surface-preopened': { open: true },
                },
            },
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(seen).toEqual([true]);

        await unmount(app);
    });

    it('lets a plugin close its own surface from inside its content', async () => {
        // The SDK equivalent of the `close` prop a legacy `PluginDef` component
        // received — a "done"/"apply" affordance inside the plugin's own UI.
        const seen: boolean[] = [];
        const surfaceRef: { current: PluginContext['surface'] | null } = {
            current: null,
        };
        const plugin = makeSurfaceDouble({
            name: '@triiiceratops/plugin-surface-selfclose',
            target: 'flyout',
            seen,
            surfaceRef,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="@triiiceratops/plugin-surface-selfclose"]',
        );
        button!.click();
        await settle();
        expect(button!.getAttribute('aria-expanded')).toBe('true');

        // The plugin closes itself; the toolbar button follows.
        surfaceRef.current!.close();
        await settle();
        expect(button!.getAttribute('aria-expanded')).toBe('false');
        expect(seen).toEqual([false, true, false]);
        expect(
            target.querySelector(
                '[data-plugin-name="@triiiceratops/plugin-surface-selfclose"]',
            ),
        ).toBeNull();

        await unmount(app);
    });
});

// Chrome DISPLAY COPY for SDK plugins (issue 2). `SdkPluginMeta.name` is the
// package-qualified IDENTITY (registry key, style namespace, `data-plugin-name`)
// and must never be the label a user reads. `definePlugin({ title })` supplies
// the label, resolved through the PLUGIN's own catalog in the viewer's active
// locale — key-or-literal, exactly like `PluginLocaleService.t`.
describe('SDK plugin chrome labels', () => {
    let target: HTMLElement;

    const TITLE_CATALOG: LocaleCatalog = {
        en: { my_title: 'My Title' },
        de: { my_title: 'Mein Titel' },
    };

    beforeEach(() => {
        target = document.createElement('div');
        document.body.appendChild(target);
        stubAnimate();
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('labels the toolbar button and the panel header from the plugin catalog, not the package name', async () => {
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-titled-double',
            target: 'panel',
            title: 'my_title',
            catalog: TITLE_CATALOG,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            'button[aria-label="My Title"]',
        );
        expect(button).not.toBeNull();
        expect(button!.getAttribute('data-tip')).toBe('My Title');
        expect(
            target.querySelector(
                'button[aria-label="@triiiceratops/plugin-titled-double"]',
            ),
        ).toBeNull();

        // Second render site: the docked panel header.
        button!.click();
        await settle();
        const section = target.querySelector<HTMLElement>(
            '[data-panel-id="triiiceratops-plugin-titled-double:panel"]',
        );
        expect(section).not.toBeNull();
        expect(section!.querySelector('.title')?.textContent).toBe('My Title');

        await unmount(app);
    });

    it('labels the flyout toggle and the flyout dialog from the plugin catalog', async () => {
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-titled-flyout',
            target: 'flyout',
            title: 'my_title',
            catalog: TITLE_CATALOG,
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            '[data-flyout-toggle][aria-label="My Title"]',
        );
        expect(button).not.toBeNull();

        const dialog = target.querySelector<HTMLElement>(
            `#${button!.getAttribute('aria-controls')}`,
        );
        expect(dialog).not.toBeNull();
        expect(dialog!.getAttribute('aria-label')).toBe('My Title');

        await unmount(app);
    });

    it('resolves the chrome label in the viewer active locale and follows a locale change', async () => {
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-titled-de',
            target: 'panel',
            title: 'my_title',
            catalog: TITLE_CATALOG,
        });

        const props = $state({
            plugins: [plugin],
            config: { locale: 'de' } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(
            target.querySelector('button[aria-label="Mein Titel"]'),
        ).not.toBeNull();

        // The label is a live thunk over the viewer's active locale, so a
        // post-mount `config.locale` change retitles the chrome.
        props.config = { locale: 'en' } as ViewerConfig;
        await settle();
        expect(
            target.querySelector('button[aria-label="My Title"]'),
        ).not.toBeNull();
        expect(
            target.querySelector('button[aria-label="Mein Titel"]'),
        ).toBeNull();

        await unmount(app);
    });

    it('renders a catalog-less title verbatim (key-or-literal)', async () => {
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-literal-title',
            target: 'panel',
            title: 'Plain Label',
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(
            target.querySelector('button[aria-label="Plain Label"]'),
        ).not.toBeNull();

        await unmount(app);
    });

    it('still resolves a legacy PluginDef name against CORE’s catalog', async () => {
        // The legacy `PluginDef.name` IS documented as display copy and may be a
        // core message key (docs/plugin-authoring.md). Adding the SDK `label`
        // must not disturb that path — it has no `label`, so the toolbar keeps
        // resolving `tooltip` through core's own catalog.
        const legacy: PluginDef = {
            id: 'legacy-core-key',
            name: 'search_panel_title',
            icon: (() => {}) as unknown as PluginDef['icon'],
        };

        const props = $state({
            plugins: [legacy],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            'button[data-plugin-toggle="legacy-core-key"]',
        );
        expect(button).not.toBeNull();
        expect(button!.getAttribute('aria-label')).toBe('Search');

        await unmount(app);
    });

    it('falls back to the old name-as-copy behavior for a plugin with no title', async () => {
        // Back-compat: a plugin built against the pre-`title` SDK must render
        // exactly what it renders today — the core-catalog lookup of `name`,
        // else `name` verbatim. Never blank, never `undefined`.
        const plugin = makeDouble({
            name: '@triiiceratops/plugin-untitled',
            target: 'panel',
        });

        const props = $state({
            plugins: [plugin],
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const button = target.querySelector<HTMLElement>(
            'button[aria-label="@triiiceratops/plugin-untitled"]',
        );
        expect(button).not.toBeNull();

        button!.click();
        await settle();
        const section = target.querySelector<HTMLElement>(
            '[data-panel-id="triiiceratops-plugin-untitled:panel"]',
        );
        expect(section!.querySelector('.title')?.textContent).toBe(
            '@triiiceratops/plugin-untitled',
        );

        await unmount(app);
    });
});
