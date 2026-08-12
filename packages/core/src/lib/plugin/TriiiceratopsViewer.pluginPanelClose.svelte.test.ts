// Core viewer × plugin panel CLOSE AFFORDANCE — the parity rule for a plugin's
// docked panel.
//
// The claim: a plugin's docked panel gets exactly the close affordance every
// core panel already has — a header close button, Escape-to-close, and
// `config.plugins[uiId].showCloseButton: false` to suppress both. All of it
// comes from `PanelStackSection` the moment `toPluginPanelItem` passes a
// `close`, so these tests assert the WIRING (and its config gate), not a
// reimplementation.
//
// FOCUS RETURN IS NOT UNIVERSAL, and these tests say so rather than dodging it.
// `PanelStackSection` returns focus to the element that was focused when the
// section mounted. For a LEFT-docked panel with the toolbar docked as a left
// rail (`toolbarOpen: true` + `controls: 'split'` + `toolbar.side: 'left'` —
// the demo's and most consumers' setting) opening the panel flips
// `dockRailLeft`, which unmounts the floating `<Toolbar/>` and mounts a new
// `<Toolbar docked/>` in the same flush. The invoker the section captured is
// already destroyed, so focus lands on `<body>`. That is pre-existing shared
// chrome behaviour, equally true of a core panel forced `position: 'left'`, and
// fixing it is out of scope here, since the fix must not touch
// `PanelStack`/`PanelStackSection`. The RIGHT-docked case below pins the
// working focus return; the LEFT-docked case pins the actual, degraded
// behaviour so there is a test ready to flip once it is fixed.
//
// Also the first test anywhere for `showCloseButton` — the flag is shared with
// every core panel through `ClosablePanelConfig`, so the default-`true` branch
// asserted here is the same default those panels rely on.

import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { definePlugin, type PluginContext } from '@triiiceratops/plugin-sdk';

import TriiiceratopsViewer from '../components/TriiiceratopsViewer.svelte';
import type { SdkPlugin } from '../types/plugin';
import type { ViewerConfig } from '../types/config';
import type { ViewerState } from '../state/viewer.svelte';

const ICON = {
    kind: 'svg',
    inner: '<circle data-close-icon="1" />',
    viewBox: '0 0 1 1',
} as const;

const NAME = '@triiiceratops/plugin-close-double';
const UIID = 'close-double';

async function settle() {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    await tick();
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

function makeDouble(): SdkPlugin {
    const plugin = definePlugin({
        name: NAME,
        uiId: UIID,
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: ICON,
        target: 'panel',
        view: {
            mount(container: HTMLElement, _context: PluginContext) {
                // A focusable child, so Escape can be dispatched from *inside*
                // the panel the way a reader's focus would be.
                const btn = container.ownerDocument.createElement('button');
                btn.textContent = 'inside';
                btn.setAttribute('data-inside', '1');
                container.appendChild(btn);
                return () => {};
            },
        },
    });
    return plugin as unknown as SdkPlugin;
}

/** The plugin's docked panel section, or null when it is not rendered. */
function panelSection(root: HTMLElement): HTMLElement | null {
    const mounted = root.querySelector<HTMLElement>(
        `[data-plugin-name="${NAME}"]`,
    );
    return mounted?.closest<HTMLElement>('[data-panel-id]') ?? null;
}

function closeButton(root: HTMLElement): HTMLElement | null {
    return (
        panelSection(root)?.querySelector<HTMLElement>('.panel-close') ?? null
    );
}

function toolbarButton(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>(`button[aria-label="${NAME}"]`);
}

describe('plugin panel close affordance (config.plugins[uiId].showCloseButton)', () => {
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

    for (const position of ['left', 'right'] as const) {
        it(`renders a close button by default on a ${position}-docked panel, and clicking it closes the plugin`, async () => {
            const props = $state({
                plugins: [makeDouble()],
                config: {
                    // The realistic consumer setting (and the demo's): an
                    // expanded toolbar, which for `position: 'left'` means the
                    // toolbar docks as a left rail. See the header note.
                    toolbarOpen: true,
                    plugins: { [UIID]: { open: true, position } },
                } as ViewerConfig,
                viewerState: undefined as ViewerState | undefined,
            });
            const app = mount(TriiiceratopsViewer, { target, props });
            await settle();

            expect(panelSection(target)).not.toBeNull();
            const close = closeButton(target);
            expect(close).not.toBeNull();
            // Named for screen readers, like every core panel's close button.
            expect(close!.getAttribute('aria-label')).toBeTruthy();

            close!.click();
            await settle();

            // Closed, and the open state agrees — a close button closes rather
            // than toggling.
            expect(panelSection(target)).toBeNull();
            expect(props.viewerState!.isPluginOpen(UIID)).toBe(false);

            await unmount(app);
        });

        it(`closes a ${position}-docked panel on Escape from inside it`, async () => {
            const props = $state({
                plugins: [makeDouble()],
                config: {
                    toolbarOpen: true,
                    plugins: { [UIID]: { open: true, position } },
                } as ViewerConfig,
                viewerState: undefined as ViewerState | undefined,
            });
            const app = mount(TriiiceratopsViewer, { target, props });
            await settle();

            const inside =
                panelSection(target)!.querySelector<HTMLElement>(
                    '[data-inside]',
                );
            expect(inside).not.toBeNull();
            inside!.focus();

            inside!.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    bubbles: true,
                    cancelable: true,
                }),
            );
            await settle();

            expect(panelSection(target)).toBeNull();
            expect(props.viewerState!.isPluginOpen(UIID)).toBe(false);

            await unmount(app);
        });
    }

    it('returns focus to the invoking toolbar toggle when the panel is docked RIGHT', async () => {
        const props = $state({
            plugins: [makeDouble()],
            config: {
                toolbarOpen: true,
                plugins: { [UIID]: { position: 'right' } },
            } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        // Open from the toolbar button WITH focus, so the section captures it as
        // the invoker to return focus to (WCAG 2.4.3). A right-docked panel
        // leaves the left-side toolbar alone, so the invoker survives.
        const toggle = toolbarButton(target);
        expect(toggle).not.toBeNull();
        toggle!.focus();
        toggle!.click();
        await settle();

        const inside =
            panelSection(target)!.querySelector<HTMLElement>('[data-inside]');
        inside!.focus();
        inside!.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );
        await settle();

        expect(panelSection(target)).toBeNull();
        expect(document.activeElement).toBe(toggle);

        await unmount(app);
    });

    it('does NOT return focus when the panel is docked LEFT under a docked left rail (pre-existing; ticket 06)', async () => {
        // Pinning the ACTUAL behaviour, not the desired one. Opening a
        // left-docked panel flips `dockRailLeft`, so the floating toolbar
        // holding the invoker is destroyed and re-created as a rail in the same
        // flush; the invoker `PanelStackSection` captured on mount is detached
        // and focus falls to `<body>`. The fix lives in shared chrome, out of
        // scope here; once it lands, this expectation flips to `toBe(toggle)`.
        const props = $state({
            plugins: [makeDouble()],
            config: {
                toolbarOpen: true,
                plugins: { [UIID]: { position: 'left' } },
            } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const toggle = toolbarButton(target);
        expect(toggle).not.toBeNull();
        toggle!.focus();
        toggle!.click();
        await settle();

        // The invoker really is gone: the toolbar was torn down and rebuilt.
        expect(toggle!.isConnected).toBe(false);

        const inside =
            panelSection(target)!.querySelector<HTMLElement>('[data-inside]');
        inside!.focus();
        inside!.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );
        await settle();

        expect(panelSection(target)).toBeNull();
        expect(props.viewerState!.isPluginOpen(UIID)).toBe(false);
        expect(document.activeElement).toBe(document.body);

        await unmount(app);
    });

    it('suppresses the button with showCloseButton: false, and Escape then does not close', async () => {
        const props = $state({
            plugins: [makeDouble()],
            config: {
                toolbarOpen: true,
                plugins: {
                    [UIID]: {
                        open: true,
                        position: 'left',
                        showCloseButton: false,
                    },
                },
            } as ViewerConfig,
            viewerState: undefined as ViewerState | undefined,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        const section = panelSection(target);
        expect(section).not.toBeNull();
        expect(closeButton(target)).toBeNull();

        // Escape is gated on the same `close`, so suppressing the button
        // suppresses the key path with it — one flag, not two.
        const inside = section!.querySelector<HTMLElement>('[data-inside]');
        inside!.focus();
        inside!.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                cancelable: true,
            }),
        );
        await settle();

        expect(panelSection(target)).not.toBeNull();
        expect(props.viewerState!.isPluginOpen(UIID)).toBe(true);

        await unmount(app);
    });

    it('leaves bottom- and overlay-position plugin panels headerless', async () => {
        // Deliberately out of scope: neither renders a `PanelStackSection`, so
        // neither gains a header or a close button from this change.
        for (const position of ['bottom', 'overlay'] as const) {
            const props = $state({
                plugins: [makeDouble()],
                config: {
                    plugins: { [UIID]: { open: true, position } },
                } as ViewerConfig,
                viewerState: undefined as ViewerState | undefined,
            });
            const app = mount(TriiiceratopsViewer, { target, props });
            await settle();

            const mounted = target.querySelector<HTMLElement>(
                `[data-plugin-name="${NAME}"]`,
            );
            expect(mounted).not.toBeNull();
            expect(mounted!.closest('[data-panel-id]')).toBeNull();
            expect(target.querySelectorAll('.panel-close').length).toBe(0);

            await unmount(app);
        }
    });
});
