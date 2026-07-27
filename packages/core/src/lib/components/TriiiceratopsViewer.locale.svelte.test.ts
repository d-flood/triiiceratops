import { describe, it, expect, afterEach, beforeEach, beforeAll } from 'vitest';
import { mount, unmount, tick } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
// The runtime `setLocale` binding is live: importing TriiiceratopsViewer runs
// i18n.svelte.ts's `overwriteSetLocale`, so this reference is the wrapped
// setter that also updates the reactive page-global `language.current`.
import { setLocale } from '../paraglide/runtime.js';

/**
 * Ticket 06 — per-viewer active locale.
 *
 * Locale is a per-viewer contract: a viewer's active locale is its typed
 * `config.locale` if set, otherwise the page default. All of that viewer's
 * chrome renders in it, and two viewers on one page can differ. These tests
 * assert on a visible chrome string — the open Search panel's title, which is
 * "Search" in `en` and "Suche" in `de`.
 */

// The Search panel's localized title lands in PanelStackSection's `.title` span,
// tagged with `data-panel-id="search"`.
function searchPanelTitle(root: HTMLElement): string | null {
    const el = root.querySelector('[data-panel-id="search"] .title');
    return el?.textContent?.trim() ?? null;
}

async function settle(ms = 50) {
    await tick();
    await new Promise((r) => setTimeout(r, ms));
    await tick();
}

// happy-dom ships an incomplete Web Animations API; Svelte's panel transitions
// call `element.animate()`, and the missing pieces throw mid-flush, which can
// abort effects scheduled after the throw. A minimal no-op animation keeps the
// transitions inert so locale reactivity (an effect) is observed deterministically.
beforeAll(() => {
    Element.prototype.animate = function () {
        return {
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        } as unknown as Animation;
    };
});

describe('TriiiceratopsViewer per-viewer active locale', () => {
    const targets: HTMLElement[] = [];
    const apps: Array<ReturnType<typeof mount>> = [];

    function mountViewer(props: Record<string, unknown>): {
        target: HTMLElement;
        state: () => any;
    } {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);
        const merged = { viewerState: undefined as any, ...props };
        const reactive = $state(merged);
        const app = mount(TriiiceratopsViewer, { target, props: reactive });
        apps.push(app);
        return { target, state: () => reactive.viewerState };
    }

    beforeEach(() => {
        // Start every test from the page default (English), reload disabled so
        // the in-memory global-variable strategy applies without a page reload.
        setLocale('en', { reload: false });
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) {
            await unmount(app);
        }
        for (const target of targets.splice(0)) {
            target.remove();
        }
        setLocale('en', { reload: false });
    });

    it('renders two viewers on one page each in its own active locale', async () => {
        // Viewer A: explicitly configured `de`. Viewer B: unset → page default `en`.
        const a = mountViewer({
            config: { locale: 'de', search: { open: true } },
        });
        const b = mountViewer({ config: { search: { open: true } } });
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Suche');
        expect(searchPanelTitle(b.target)).toBe('Search');

        // The active locale is also exposed on each ViewerState as observable
        // state: config.locale when set, else the page default.
        expect(a.state()?.activeLocale).toBe('de');
        expect(b.state()?.activeLocale).toBe('en');
    });

    it('follows the global locale only when config.locale is unset', async () => {
        // Viewer A pins `en` via config; Viewer B follows the page default.
        const a = mountViewer({
            config: { locale: 'en', search: { open: true } },
        });
        const b = mountViewer({ config: { search: { open: true } } });
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(searchPanelTitle(b.target)).toBe('Search');

        // Change the page-global locale to `de`.
        setLocale('de', { reload: false });
        await settle();

        // The unset viewer follows the global change; the `en`-configured viewer
        // does not — locale does not leak between viewers on one page.
        expect(searchPanelTitle(b.target)).toBe('Suche');
        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(a.state()?.activeLocale).toBe('en');
        expect(b.state()?.activeLocale).toBe('de');
    });

    it('re-renders a viewer when its config.locale changes', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);

        const props = $state({
            config: { locale: 'en', search: { open: true } } as Record<
                string,
                unknown
            >,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();

        expect(searchPanelTitle(target)).toBe('Search');
        expect(props.viewerState?.activeLocale).toBe('en');

        // Switching this viewer's configured locale updates its own chrome.
        props.config = { locale: 'de', search: { open: true } };
        await settle();

        expect(searchPanelTitle(target)).toBe('Suche');
        expect(props.viewerState?.activeLocale).toBe('de');
    });
});
