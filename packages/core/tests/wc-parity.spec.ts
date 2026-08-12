import { test, expect, type Page } from '@playwright/test';

/**
 * Web Component ESM/IIFE parity.
 *
 * Two fixture pages (public/e2e/wc-iife.html and public/e2e/wc-esm.html) load
 * the two built Web Component entries — the self-contained IIFE and the
 * standards-based ESM registration entry. Both must register the same tag and
 * expose identical documented behavior: the same browser-runtime descriptor, the
 * same element properties, a rendered manifest, and the same cross-shadow
 * viewer change events (e.g. `manifestchange`). Requires `pnpm build:element`
 * (or build:all) to have produced dist/ first.
 */

interface RuntimeShape {
    coreVersion: string;
    pluginApiVersion: string;
    capabilities: string[];
    hasRegistry: boolean;
}

interface ElementProps {
    entry: string | undefined;
    manifestId: unknown;
    theme: unknown;
}

/**
 * The custom element's state bridge and its property-only `searchProvider`
 * input, observed through the BUILT element rather than a native Svelte
 * component.
 */
interface StateBridge {
    availabilityEvents: Array<{
        targetIsHost: boolean;
        detailIsProperty: boolean;
        bubbles: boolean;
        composed: boolean;
    }>;
    getterOnlyOnPrototype: boolean;
    noOwnProperty: boolean;
    searchCalls: Array<{ query: string; manifestId: string }>;
    searchResultCount: number;
    searchProviderAttribute: string | null;
}

async function drive(
    page: Page,
    path: string,
    expectedEntry: string,
): Promise<{
    runtime: RuntimeShape;
    props: ElementProps;
    bridge: StateBridge;
}> {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // The entry registered the custom element.
    await page.waitForFunction(
        () => !!customElements.get('triiiceratops-viewer'),
        undefined,
        { timeout: 20000 },
    );

    // The window.Triiiceratops namespace is bootstrapped and core-filled.
    const runtime = await page.evaluate((): RuntimeShape | null => {
        const t = (window as unknown as { Triiiceratops?: any }).Triiiceratops;
        if (!t) return null;
        return {
            coreVersion: t.coreVersion,
            pluginApiVersion: t.pluginApiVersion,
            capabilities: [...t.capabilities],
            hasRegistry: typeof t.plugins?.register === 'function',
        };
    });
    expect(runtime, 'window.Triiiceratops should exist').not.toBeNull();
    expect(runtime!.coreVersion).not.toBe('');
    expect(runtime!.pluginApiVersion).not.toBe('');
    // Present and enumerable, NOT non-empty: core's 1.0 line declares no
    // capabilities at all. The one that ever existed named a bundled
    // third-party major and was retired with no successor, so what the runtime
    // has to keep promising is that the list exists and can be read — the
    // parity assertion below (`esm` equals `iife`) is what this really guards.
    expect(Array.isArray(runtime!.capabilities)).toBe(true);
    expect(runtime!.hasRegistry).toBe(true);

    // Documented element properties are readable off the custom element.
    const props = await page.evaluate((): ElementProps => {
        const el = document.getElementById('v') as unknown as {
            manifestId: unknown;
            theme: unknown;
        };
        return {
            entry: (window as unknown as { __wcEntry?: string }).__wcEntry,
            manifestId: el.manifestId,
            theme: el.theme,
        };
    });
    expect(props.entry).toBe(expectedEntry);
    expect(props.manifestId).toBe('/demo-manifests/e2e/manifest.json');
    expect(props.theme).toBe('dark');

    // Renders a manifest: the renderer's canvas appears inside the (open) shadow root.
    const canvas = page.locator('triiiceratops-viewer canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // A documented viewer change event crosses the (composed) shadow boundary.
    await page.waitForFunction(
        () =>
            ((window as unknown as { __statechangeCount?: number })
                .__statechangeCount ?? 0) > 0,
        undefined,
        { timeout: 20000 },
    );

    // The state bridge announced the element's own ViewerState.
    await page.waitForFunction(
        () =>
            ((window as unknown as { __viewerStateEvents?: unknown[] })
                .__viewerStateEvents?.length ?? 0) > 0,
        undefined,
        { timeout: 20000 },
    );

    const bridge = await page.evaluate(async (): Promise<StateBridge> => {
        const el = document.getElementById('v') as unknown as {
            viewerState: any;
            getAttribute(name: string): string | null;
        };
        const ctor = customElements.get('triiiceratops-viewer')!;
        const descriptor = Object.getOwnPropertyDescriptor(
            ctor.prototype,
            'viewerState',
        );
        const w = window as unknown as {
            __viewerStateEvents: StateBridge['availabilityEvents'];
            __searchCalls: StateBridge['searchCalls'];
        };
        // Drive the real search path through the property-assigned provider.
        await el.viewerState.search('parity');
        return {
            availabilityEvents: w.__viewerStateEvents,
            getterOnlyOnPrototype:
                typeof descriptor?.get === 'function' &&
                descriptor?.set === undefined,
            noOwnProperty:
                Object.getOwnPropertyDescriptor(el, 'viewerState') ===
                undefined,
            searchCalls: w.__searchCalls,
            searchResultCount: el.viewerState.searchResults.length,
            searchProviderAttribute: el.getAttribute('searchprovider'),
        };
    });

    // Exactly one availability event for the one mounted state instance, and
    // the detail is the very object the getter returns.
    expect(bridge.availabilityEvents).toEqual([
        {
            targetIsHost: true,
            detailIsProperty: true,
            bubbles: true,
            composed: true,
        },
    ]);
    // Getter-only, on the prototype — the wrappers' version handshake.
    expect(bridge.getterOnlyOnPrototype).toBe(true);
    expect(bridge.noOwnProperty).toBe(true);
    // The provider assigned as a property (never as an attribute) ran.
    expect(bridge.searchCalls).toHaveLength(1);
    expect(bridge.searchCalls[0].query).toBe('parity');
    expect(bridge.searchCalls[0].manifestId).toBeTruthy();
    expect(bridge.searchResultCount).toBe(1);
    expect(bridge.searchProviderAttribute).toBeNull();

    expect(pageErrors, 'no uncaught page errors').toEqual([]);

    return { runtime: runtime!, props, bridge };
}

test.describe('Web Component ESM/IIFE parity', () => {
    test('both entries register the same tag and expose identical documented behavior', async ({
        page,
    }) => {
        const iife = await drive(page, '/e2e/wc-iife.html', 'iife');
        const esm = await drive(page, '/e2e/wc-esm.html', 'esm');

        // Identical browser-runtime descriptor across entries.
        expect(esm.runtime.coreVersion).toBe(iife.runtime.coreVersion);
        expect(esm.runtime.pluginApiVersion).toBe(
            iife.runtime.pluginApiVersion,
        );
        expect(esm.runtime.capabilities).toEqual(iife.runtime.capabilities);

        // Identical documented element properties across entries.
        expect(esm.props.manifestId).toBe(iife.props.manifestId);
        expect(esm.props.theme).toBe(iife.props.theme);

        // Identical state bridge across entries, including for the ESM fixture
        // where `searchProvider` was assigned before the tag was even defined.
        expect(esm.bridge.availabilityEvents).toEqual(
            iife.bridge.availabilityEvents,
        );
        expect(esm.bridge.searchCalls).toEqual(iife.bridge.searchCalls);
    });
});
