import { test, expect, type Page } from '@playwright/test';

/**
 * Web Component ESM/IIFE parity (ticket 10).
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

async function drive(
    page: Page,
    path: string,
    expectedEntry: string,
): Promise<{ runtime: RuntimeShape; props: ElementProps }> {
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
    expect(runtime!.capabilities.length).toBeGreaterThan(0);
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

    // Renders a manifest: an OSD canvas appears inside the (open) shadow root.
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

    expect(pageErrors, 'no uncaught page errors').toEqual([]);

    return { runtime: runtime!, props };
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
    });
});
