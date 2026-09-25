import { describe, it, expect, afterEach, beforeEach, beforeAll } from 'vitest';
import { mount, unmount, tick } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import ActiveLocaleMessagesTestHost from './ActiveLocaleMessagesTestHost.svelte';
import de from '../messages/de.json';
import { configureLogging, type LogLevel } from '../logging/logger';
import type { ViewerError } from '../types/viewerError';

/**
 * The German chrome catalog reaches a viewer the way every non-English catalog
 * now does: as a host's `config.messages`. Core ships only English inline, and
 * publishes this file as the `triiiceratops/locales/de.json` asset.
 */
const germanMessages = { de };

/**
 * Set the page default the way a host does: by declaring the document's
 * language. `i18n.svelte.ts` observes the attribute, so the reactive
 * page-global locale follows within a microtask — every caller here awaits
 * `settle()` before asserting.
 */
function setPageLocale(locale: string) {
    document.documentElement.lang = locale;
}

/**
 * Per-viewer active locale.
 *
 * Locale is a per-viewer contract: a viewer's active locale is the language its
 * own picker chose if the user chose one, otherwise its typed `config.locale`,
 * otherwise the page default. All of that viewer's chrome renders in it, and
 * two viewers on one page can differ. These tests assert on a visible chrome
 * string — the open Search panel's title, which is "Search" in `en` and
 * "Suche" in `de`.
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
        // Start every test from the page default (English).
        setPageLocale('en');
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) {
            await unmount(app);
        }
        for (const target of targets.splice(0)) {
            target.remove();
        }
        configureLogging({ debug: false, sink: null });
        setPageLocale('en');
    });

    it('renders two viewers on one page each in its own active locale', async () => {
        // Viewer A: explicitly configured `de`. Viewer B: unset → page default `en`.
        const a = mountViewer({
            config: {
                locale: 'de',
                messages: germanMessages,
                search: { open: true },
            },
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
            config: {
                locale: 'en',
                messages: germanMessages,
                search: { open: true },
            },
        });
        const b = mountViewer({
            config: { messages: germanMessages, search: { open: true } },
        });
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(searchPanelTitle(b.target)).toBe('Search');

        // Change the page-global locale to `de`.
        setPageLocale('de');
        await settle();

        // The unset viewer follows the global change; the `en`-configured viewer
        // does not — locale does not leak between viewers on one page.
        expect(searchPanelTitle(b.target)).toBe('Suche');
        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(a.state()?.activeLocale).toBe('en');
        expect(b.state()?.activeLocale).toBe('de');
    });

    it('lets the language picker outrank config.locale', async () => {
        const a = mountViewer({
            config: {
                locale: 'en',
                messages: germanMessages,
                search: { open: true },
            },
        });
        await settle();
        expect(searchPanelTitle(a.target)).toBe('Search');

        // What the toolbar's language menu calls.
        a.state().setLocale('de');
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Suche');
        expect(a.state().activeLocale).toBe('de');

        // ...and handing the choice back returns the viewer to its host's.
        a.state().setLocale(null);
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(a.state().activeLocale).toBe('en');
    });

    it('keeps the chrome out of a locale core has no catalog for', async () => {
        // The picker offers whatever the MANIFEST is authored in, so a content
        // locale core cannot render is the normal case, not an edge one: the
        // chrome has to fall back rather than render a catalog nobody asked for.
        const a = mountViewer({ config: { search: { open: true } } });
        await settle();

        a.state().setLocale('fr');
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Search');
        // ...while the active locale still reports the content language, which
        // is what the language maps resolve against.
        expect(a.state().activeLocale).toBe('fr');
    });

    it('leaves untranslatable chrome in the surrounding page language', async () => {
        setPageLocale('de');
        const a = mountViewer({
            config: { messages: germanMessages, search: { open: true } },
        });
        await settle();
        expect(searchPanelTitle(a.target)).toBe('Suche');

        a.state().setLocale('fr');
        await settle();

        // German, not English: the chrome stays where the application is rather
        // than snapping to the base locale.
        expect(searchPanelTitle(a.target)).toBe('Suche');
        expect(a.state().activeLocale).toBe('fr');
    });

    it('keeps a picked locale across unrelated config changes', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);

        const props = $state({
            config: {
                locale: 'en',
                messages: germanMessages,
                search: { open: true },
            } as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();

        props.viewerState.setLocale('de');
        await settle();
        expect(searchPanelTitle(target)).toBe('Suche');

        // A config change that says nothing about locale must not undo the pick.
        props.config = {
            locale: 'en',
            messages: germanMessages,
            search: { open: true },
            showToggle: false,
        };
        await settle();
        expect(searchPanelTitle(target)).toBe('Suche');
    });

    it('drops a picked locale when the host names a different one', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);

        const props = $state({
            config: {
                messages: germanMessages,
                search: { open: true },
            } as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();

        props.viewerState.setLocale('de');
        await settle();
        expect(searchPanelTitle(target)).toBe('Suche');

        // An explicit new instruction from the embedder wins, as it does for
        // viewingMode.
        props.config = {
            locale: 'en',
            messages: germanMessages,
            search: { open: true },
        };
        await settle();

        expect(searchPanelTitle(target)).toBe('Search');
        expect(props.viewerState.activeLocale).toBe('en');
    });

    it('renders a host catalog, falling back per key for what it omits', async () => {
        // A host that wants two strings reworded supplies two strings. Every
        // key the catalog omits still renders in English rather than failing.
        const a = mountViewer({
            config: {
                messages: { en: { search: 'Find' } },
                search: { open: true },
            },
        });
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Find');
        // `search_panel_title` is a different key the catalog says nothing
        // about: still English, not the bare key name.
        expect(
            a.target
                .querySelector('[data-panel-id="search"][role="dialog"]')
                ?.getAttribute('aria-label'),
        ).toBe('Search');
    });

    it('renders English until loadMessages resolves, then swaps', async () => {
        let deliver: (messages: Record<string, string>) => void = () => {};
        const pending = new Promise<Record<string, string>>((resolve) => {
            deliver = resolve;
        });
        const asked: string[] = [];

        const a = mountViewer({
            config: {
                locale: 'de',
                loadMessages: (locale: string) => {
                    asked.push(locale);
                    return pending;
                },
                search: { open: true },
            },
        });
        await settle();

        // The picker never waits on a catalog: the viewer is already in `de`
        // and the chrome renders what it can until the German arrives.
        expect(asked).toEqual(['de']);
        expect(a.state()?.activeLocale).toBe('de');
        expect(searchPanelTitle(a.target)).toBe('Search');

        deliver(de);
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Suche');
        // One call per locale per viewer, whatever else re-renders.
        a.state().setLocale('de');
        await settle();
        expect(asked).toEqual(['de']);
    });

    it('stays English when loadMessages rejects, with no viewererror', async () => {
        const records: Array<{ level: LogLevel; message: string }> = [];
        configureLogging({
            debug: true,
            sink: (level, args) =>
                records.push({ level, message: args.join(' ') }),
        });
        const errors: ViewerError[] = [];

        const a = mountViewer({
            config: {
                debug: true,
                locale: 'de',
                loadMessages: () => Promise.reject(new Error('offline')),
                search: { open: true },
            },
            onviewererror: (error: ViewerError) => errors.push(error),
        });
        await settle();

        expect(searchPanelTitle(a.target)).toBe('Search');
        expect(errors).toEqual([]);
        // Reported through the debug logger instead — a host's catalog server
        // being down is a diagnostic, not a viewer failure.
        expect(
            records.filter(
                (r) => r.level === 'warn' && r.message.includes('loadMessages'),
            ),
        ).toHaveLength(1);
    });

    it('re-renders a viewer when its config.locale changes', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);

        const props = $state({
            config: {
                locale: 'en',
                messages: germanMessages,
                search: { open: true },
            } as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();

        expect(searchPanelTitle(target)).toBe('Search');
        expect(props.viewerState?.activeLocale).toBe('en');

        // Switching this viewer's configured locale updates its own chrome.
        props.config = {
            locale: 'de',
            messages: germanMessages,
            search: { open: true },
        };
        await settle();

        expect(searchPanelTitle(target)).toBe('Suche');
        expect(props.viewerState?.activeLocale).toBe('de');
    });
});

/**
 * The message accessor itself, at the seam a viewer root publishes into. The
 * suite above proves the locale a viewer resolves; these prove what the chrome
 * accessor does with it — interpolated inputs, lookup by message name, and a
 * locale read at call time rather than captured when the accessor was made.
 */
describe('per-viewer active locale message dispatch', () => {
    const targets: HTMLElement[] = [];
    const apps: Array<ReturnType<typeof mount>> = [];

    afterEach(async () => {
        for (const app of apps.splice(0)) {
            await unmount(app);
        }
        for (const target of targets.splice(0)) {
            target.remove();
        }
        setPageLocale('en');
    });

    function mountHost(
        locale: string,
        messageKey = 'close',
        extra: Record<string, unknown> = { messages: germanMessages },
    ) {
        const target = document.createElement('div');
        document.body.appendChild(target);
        targets.push(target);
        const props = $state({ locale, messageKey, ...extra });
        apps.push(mount(ActiveLocaleMessagesTestHost, { target, props }));
        return {
            props,
            text: (id: string) =>
                target
                    .querySelector(`[data-testid="${id}"]`)
                    ?.textContent?.trim() ?? null,
        };
    }

    it('interpolates inputs and resolves a message named at runtime', async () => {
        const host = mountHost('de', 'close');
        await settle();

        expect(host.text('interpolated')).toBe('3 Annotationen');
        expect(host.text('dynamic')).toBe('Schließen');
    });

    it('renders a later active locale rather than the one it was made in', async () => {
        // The accessor is built once during initialization; every call must ask
        // the active-locale source again, so a locale change reaches messages
        // already handed to a component.
        const host = mountHost('en', 'close');
        await settle();
        expect(host.text('interpolated')).toBe('3 Annotations');
        expect(host.text('dynamic')).toBe('Close');

        host.props.locale = 'de';
        await settle();

        expect(host.text('interpolated')).toBe('3 Annotationen');
        expect(host.text('dynamic')).toBe('Schließen');
    });

    it('keeps a content locale core has no catalog for on the page default', async () => {
        setPageLocale('de');
        const host = mountHost('fr', 'close');
        await settle();

        expect(host.text('interpolated')).toBe('3 Annotationen');
        expect(host.text('dynamic')).toBe('Schließen');
    });
});
