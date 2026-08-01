import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from '@playwright/test';

// The shared journey for the two packed framework-wrapper consumer fixtures
// (`framework-react`, `framework-vue`).
//
// Both fixtures build three routes from the SAME packed `triiiceratops`
// tarball and expose one identical in-page control surface (`window.__tri` on
// the client route, `window.__ssr` on the server route, `window.__conflict` on
// the conflict route), so this one journey can drive both frameworks and prove
// their behaviour is genuinely the same contract rather than two similar ones.
//
// Everything asserted here is PUBLIC wrapper behaviour observed from outside:
// DOM attributes and properties, rendered readouts, delivered event payloads,
// the two-member imperative handle, and the element's documented `viewerState`
// bridge. No framework internals, no Svelte effects, no private fields, and no
// subscription collection sizes.
//
// Runs in the driver process, so it is never copied into the built consumer.

/** Canvas and manifest identifiers, kept in step with each fixture's `src/fixtures.js`. */
const MANIFEST_ID = 'local://primary';
const C1 = 'primary/c1';
const C2 = 'primary/c2';
const C3 = 'primary/c3';
const SECOND_CANVAS = 'canvas/p1';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', 'vendor']);

function fixtureFiles(dir, base = dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            fixtureFiles(full, base, out);
        } else {
            out.push({ path: relative(base, full), full });
        }
    }
    return out;
}

function installedPackageNames(fixtureDir) {
    const names = new Set();
    const root = join(fixtureDir, 'node_modules');
    if (!existsSync(root)) return names;
    for (const name of readdirSync(root)) {
        if (name === '.bin') continue;
        if (name === '.pnpm') {
            // pnpm's virtual store. Entries are `<name>@<version>[_peers]`,
            // with `/` written as `+` — e.g. `svelte@5.56.6`,
            // `@sveltejs+kit@2.0.0`, `@vitejs+plugin-vue@6.0.0_vite@6.4.3`.
            for (const entry of readdirSync(join(root, name))) {
                const at = entry.indexOf('@', 1);
                const raw = at === -1 ? entry : entry.slice(0, at);
                names.add(raw.replace('+', '/'));
            }
            continue;
        }
        if (name.startsWith('@')) {
            for (const scoped of readdirSync(join(root, name))) {
                names.add(`${name}/${scoped}`);
            }
            continue;
        }
        names.add(name);
    }
    return names;
}

/**
 * Acceptance criterion 1: no Svelte package, no Svelte Vite plugin, no plugin
 * SDK — declared, configured, or resolved — and (Vue) no custom-element
 * compiler configuration anywhere in the fixture.
 */
function assertNoSvelteAndNoSdk(fixtureDir, { absentPeer }) {
    const pkg = JSON.parse(
        readFileSync(join(fixtureDir, 'package.json'), 'utf8'),
    );
    const declared = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
    });
    expect(
        declared.filter((name) => /svelte/i.test(name)),
        'the fixture must declare no Svelte dependency',
    ).toEqual([]);
    expect(
        declared.filter((name) => name.startsWith('@triiiceratops/')),
        'the fixture must declare no plugin SDK or plugin package',
    ).toEqual([]);

    const installed = installedPackageNames(fixtureDir);
    expect(
        [...installed].filter((name) => /^(svelte|@sveltejs\/)/.test(name)),
        'no Svelte package may resolve into the install',
    ).toEqual([]);
    expect(
        [...installed].filter((name) => name.startsWith('@triiiceratops/')),
        'no plugin SDK may resolve into the install',
    ).toEqual([]);
    expect(
        installed.has('triiiceratops'),
        'the packed core tarball must be installed',
    ).toBe(true);
    // The unused framework peer is optional, so it must not be dragged in.
    expect(
        installed.has(absentPeer),
        `the optional "${absentPeer}" peer must not be installed`,
    ).toBe(false);

    for (const file of fixtureFiles(fixtureDir)) {
        if (!/\.(m?js|ts|json|html|vue)$/.test(file.path)) continue;
        // `harness.mjs` is driver-side orchestration, not part of the consumer
        // application, and it is never installed or built.
        if (file.path === 'harness.mjs') continue;
        const text = readFileSync(file.full, 'utf8');
        const specifiers = [
            ...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
        ].map((m) => m[1]);
        expect(
            specifiers.filter((s) => /svelte/i.test(s)),
            `${file.path} must import nothing from Svelte`,
        ).toEqual([]);
        expect(
            text.includes('isCustomElement'),
            `${file.path} must not configure a custom-element compiler option`,
        ).toBe(false);
    }
    expect(
        existsSync(join(fixtureDir, 'svelte.config.js')),
        'the fixture must ship no Svelte config',
    ).toBe(false);
}

const CHANNELS = [
    'statechange',
    'canvaschange',
    'manifestchange',
    'choicechange',
    'pluginerror',
    'viewererror',
];

function channel(events, viewer, name) {
    return (
        events[`${viewer}:${name}`] ?? {
            callbackCount: 0,
            domCount: 0,
            identityOk: null,
            envelopeOk: null,
            note: null,
        }
    );
}

export async function assertFrameworkFixture(ctx, options) {
    const { page, baseURL, consoleMessages, pageErrors, fixtureDir } = ctx;
    const { framework, absentPeer, keepAlive } = options;

    assertNoSvelteAndNoSdk(fixtureDir, { absentPeer });

    // ── Client route ───────────────────────────────────────────────────────
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });

    const v1Canvas = page.locator('[data-testid="v1-canvas"]');
    const v1Toolbar = page.locator('[data-testid="v1-toolbar"]');
    const v1Zoom = page.locator('[data-testid="v1-zoom"]');
    const v1ZoomState = page.locator('[data-testid="v1-zoom-state"]');
    const v1Dynamic = page.locator('[data-testid="v1-dynamic"]');
    const v1Gated = page.locator('[data-testid="v1-gated"]');
    const v2Canvas = page.locator('[data-testid="v2-canvas"]');
    const v2Toolbar = page.locator('[data-testid="v2-toolbar"]');
    const deepCanvas = page.locator('[data-testid="deep-canvas"]');
    const fragile = page.locator('[data-testid="fragile"]');
    const fragileError = page.locator('[data-testid="fragile-error"]');
    const kitCanvas = page.locator('[data-testid="kit-canvas"]');

    // Both viewers reach their own first canvas through the property tier
    // (viewer 1, `manifestJson`) and an HTTP manifest (viewer 2, `manifest-id`).
    await expect(v1Canvas).toHaveText(C1, { timeout: 30_000 });
    await expect(v2Canvas).toHaveText(SECOND_CANVAS, { timeout: 30_000 });
    // The context form, resolved through the provider with no handle argument.
    await expect(deepCanvas).toHaveText(C1, { timeout: 30_000 });

    // 1. Registration, prop tiers, host attributes, no extra layout element.
    const probe = await page.evaluate(() => window.__tri.probe());
    expect(
        probe.definedBeforeMount,
        'importing the framework entry point must register nothing',
    ).toBe(false);
    expect(
        probe.elementDefined,
        'a mounted wrapper registers the element',
    ).toBe(true);
    expect(
        probe.sharedRegistration,
        'both wrapper instances share ONE registration',
    ).toBe(true);
    expect(
        probe.singleChildHost,
        'the wrapper renders exactly one element and no layout wrapper',
    ).toBe(true);
    expect(probe.attributeTier).toEqual({
        manifestId: MANIFEST_ID,
        canvasId: C1,
        theme: 'light',
    });
    expect(probe.hostAttributes.id).toBe('viewer-1');
    expect(probe.hostAttributes.class).toContain('fixture-viewer');
    expect(probe.hostAttributes.style).toContain('height');
    expect(probe.hostAttributes.data).toBe('primary');
    expect(probe.hostAttributes.aria).toBe('Primary fixture viewer');
    expect(
        probe.propertyTier,
        'object- and function-valued inputs arrive as properties, by identity',
    ).toEqual({
        manifestJson: true,
        config: true,
        themeConfig: true,
        searchProvider: true,
        searchProviderType: 'function',
        plugins: true,
    });
    expect(
        probe.stringifiedAttributes,
        'no property-tier value may be stringified into an attribute',
    ).toEqual([]);

    // 2. `frame` cadence, driven by a real OpenSeadragon zoom — and the same
    //    projection at the default `state` cadence as the contrast, which the
    //    batched watcher never wakes.
    await expect
        .poll(() => page.evaluate(() => window.__tri.osdReady()), {
            timeout: 30_000,
        })
        .toBe(true);
    await expect
        .poll(async () => Number(await v1Zoom.textContent()), {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
    const zoomBefore = Number(await v1Zoom.textContent());
    const stateZoomBefore = await v1ZoomState.textContent();
    await expect
        .poll(
            async () => {
                await page.evaluate(() => window.__tri.zoomIn());
                return Number(await v1Zoom.textContent());
            },
            { timeout: 30_000 },
        )
        .not.toBe(zoomBefore);
    expect(
        await v1ZoomState.textContent(),
        'a `state`-cadence projection is NOT woken by OpenSeadragon',
    ).toBe(stateZoomBefore);

    // 3. Commands through the handle, at `state` cadence, per viewer.
    await page.evaluate(() => window.__tri.toggleToolbar(1));
    await expect(v1Toolbar).toHaveText('open', { timeout: 15_000 });
    await expect(v2Toolbar).toHaveText('closed');

    const v2CanvasEventsBefore = channel(
        await page.evaluate(() => window.__tri.events()),
        'viewer-2',
        'canvaschange',
    ).callbackCount;

    await page.evaluate((canvasId) => window.__tri.navigate(canvasId), C3);
    await expect(v1Canvas).toHaveText(C3, { timeout: 15_000 });
    await expect(deepCanvas).toHaveText(C3);
    await expect(v2Canvas).toHaveText(SECOND_CANVAS);

    // 4. `choicechange`, and then the two error channels.
    await page.evaluate(() => window.__tri.selectChoice());
    await page.evaluate(() => window.__tri.setConflictConfig());
    await expect
        .poll(
            async () =>
                channel(
                    await page.evaluate(() => window.__tri.events()),
                    'viewer-1',
                    'viewererror',
                ).callbackCount,
            { timeout: 15_000 },
        )
        .toBeGreaterThan(0);

    // 5. Every translated channel: delivered, with the EXACT detail object.
    const events = await page.evaluate(() => window.__tri.events());
    for (const name of CHANNELS) {
        const viewer = name === 'manifestchange' ? 'viewer-2' : 'viewer-1';
        const entry = channel(events, viewer, name);
        expect(
            entry.callbackCount,
            `${framework}: the ${name} channel must reach a framework handler`,
        ).toBeGreaterThan(0);
        expect(
            entry.identityOk,
            `${framework}: ${name} must deliver the exact CustomEvent detail`,
        ).toBe(true);
        expect(
            entry.envelopeOk,
            `${framework}: ${name} must deliver the detail, not the DOM event`,
        ).toBe(true);
    }
    expect(channel(events, 'viewer-1', 'viewererror').note).toBe(
        'config/nav-edge-conflict',
    );
    expect(channel(events, 'viewer-1', 'pluginerror').note).toBe(
        '@fixture/flaky-plugin/setup',
    );

    // 6. The delivered `PluginError` keeps a callable `retry()`.
    let stats = await page.evaluate(() => window.__tri.pluginStats());
    expect(stats.flaky).toMatchObject({ activations: 1, mounts: 0 });
    expect(await page.evaluate(() => window.__tri.retryPlugin())).toBe(
        'retried',
    );
    await expect
        .poll(
            async () =>
                (await page.evaluate(() => window.__tri.pluginStats())).flaky
                    .mounts,
            { timeout: 15_000 },
        )
        .toBe(1);

    // 7. Post-mount prop updates take effect; an unchanged prop writes nothing.
    await page.evaluate(() => window.__tri.setThemeProp('teal'));
    await expect
        .poll(
            async () =>
                (await page.evaluate(() => window.__tri.probe())).attributeTier
                    .theme,
            { timeout: 15_000 },
        )
        .toBe('teal');

    // The viewer is at C3 by internal navigation while the `canvasId` PROP is
    // still C1. Re-rendering with identical props must not drag it back.
    const beforeRerender = await page.evaluate(() => window.__tri.probe());
    expect(beforeRerender.stateCanvasId).toBe(C3);
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__tri.rerenderEqual());
    }
    await page.waitForTimeout(400);
    const afterRerender = await page.evaluate(() => window.__tri.probe());
    expect(
        afterRerender.stateCanvasId,
        'an unchanged canvasId must never undo internal navigation',
    ).toBe(C3);
    expect(afterRerender.attributeTier.canvasId).toBe(C1);
    await expect(v1Canvas).toHaveText(C3);

    // 8. Plugins survive a parent re-render that supplies an equal list.
    stats = await page.evaluate(() => window.__tri.pluginStats());
    expect(
        stats.stable,
        'an equal plugin list must leave a running plugin untouched',
    ).toMatchObject({ activations: 1, mounts: 1, cleanups: 0 });

    // 9. A CHANGED attribute-tier prop does take effect.
    await page.evaluate((canvasId) => window.__tri.setCanvasProp(canvasId), C2);
    await expect(v1Canvas).toHaveText(C2, { timeout: 15_000 });
    const afterPropChange = await page.evaluate(() => window.__tri.probe());
    expect(afterPropChange.attributeTier.canvasId).toBe(C2);
    expect(afterPropChange.stateCanvasId).toBe(C2);

    // 10. Inline projections whose inputs change, with no memoisation at all.
    expect(await v1Dynamic.textContent()).toBe(`0:${C2}`);
    await page.evaluate(() => window.__tri.bumpDynamic());
    await expect(v1Dynamic).toHaveText(`1:${C2}`, { timeout: 15_000 });

    // …and a CURRENT equality function: while it collapses every comparison the
    // projection holds its previous value, and releasing it never serves a
    // stale one.
    expect(await v1Gated.textContent()).toBe(C2);
    await page.evaluate(() => window.__tri.setCoarseEquality(true));
    await page.evaluate((canvasId) => window.__tri.navigate(canvasId), C1);
    await expect(v1Canvas).toHaveText(C1, { timeout: 15_000 });
    await expect(v1Gated).toHaveText(C2);
    await page.evaluate(() => window.__tri.setCoarseEquality(false));
    await expect(v1Gated).toHaveText(C1, { timeout: 15_000 });

    // 11. A consumer projection failure reaches framework-native error capture
    //     — never `viewererror`, never `pluginerror`, never a stale value.
    await expect(fragile).toHaveText(C1);
    const totalsBefore = await page.evaluate(() => window.__tri.totals());
    await page.evaluate(() => window.__tri.breakSelector());
    await expect(fragileError).toHaveText('consumer projection failed', {
        timeout: 15_000,
    });
    await expect(fragile).toHaveText('gone');
    const captured = await page.evaluate(() => window.__tri.capturedErrors());
    expect(
        captured.some((m) => m.includes('consumer projection failed')),
        `${framework}: the failure must reach native application error handling`,
    ).toBe(true);
    expect(
        await page.evaluate(() => window.__tri.totals()),
        'a consumer failure is never reported as a viewer or plugin error',
    ).toEqual(totalsBefore);
    // Move the viewer while the consumer's projection is broken, then fix it:
    // the selection must be CURRENT, never the value cached before the failure.
    await page.evaluate((canvasId) => window.__tri.navigate(canvasId), C3);
    await expect(v1Canvas).toHaveText(C3, { timeout: 15_000 });
    await page.evaluate(() => window.__tri.fixSelector());
    await expect(fragileError).toHaveText('ok', { timeout: 15_000 });
    await expect(fragile).toHaveText(C3);

    // 12. The ticket-08 testing helper, from the same tarball: a real command on
    //     a real headless `ViewerState`, observed by a real projection.
    await expect(kitCanvas).toHaveText('none');
    await page.evaluate(() => window.__tri.driveTestHandle());
    await expect(kitCanvas).toHaveText('kit/canvas-2', { timeout: 15_000 });

    // 13. Two viewers: complete isolation of state, selectors, commands,
    //     callbacks, and handles.
    const handles = await page.evaluate(() => window.__tri.handleSnapshot());
    expect(handles.v1.bound).toBe(true);
    expect(handles.v2.bound).toBe(true);
    expect(handles.v1.elementId).toBe('viewer-1');
    expect(handles.v2.elementId).toBe('viewer-2');
    expect(handles.v1.elementInDom).toBe(true);
    expect(handles.v2.elementInDom).toBe(true);
    expect(
        handles.v1.stateMatchesElement && handles.v2.stateMatchesElement,
        'the handle exposes the same state instance the element publishes',
    ).toBe(true);
    expect(handles.distinctStates).toBe(true);
    expect(handles.distinctElements).toBe(true);
    if (framework === 'react') {
        expect(
            handles.refMatchesHandle,
            'the forwarded ref yields the binding’s own handle',
        ).toBe(true);
    }
    const eventsNow = await page.evaluate(() => window.__tri.events());
    expect(
        channel(eventsNow, 'viewer-2', 'canvaschange').callbackCount,
        'viewer 1 navigation must not reach viewer 2’s callbacks',
    ).toBe(v2CanvasEventsBefore);
    await page.evaluate(() => window.__tri.toggleToolbar(2));
    await expect(v2Toolbar).toHaveText('open', { timeout: 15_000 });
    await expect(v1Toolbar).toHaveText('open');
    await expect(v2Canvas).toHaveText(SECOND_CANVAS);

    // 14. Unmount clears callbacks, handles, and the imperative ref; remount
    //     rebinds cleanly to a brand-new viewer state.
    const stateIdBefore = handles.v1.stateId;
    const eventsBeforeUnmount = await page.evaluate(() =>
        window.__tri.events(),
    );
    await page.evaluate(() => window.__tri.unmountViewer1());
    await expect(page.locator('#viewer-1-host')).toHaveCount(0, {
        timeout: 15_000,
    });
    const afterUnmount = await page.evaluate(() =>
        window.__tri.handleSnapshot(),
    );
    expect(afterUnmount.v1.bound, 'the handle unbinds on unmount').toBe(false);
    if (framework === 'react') {
        expect(afterUnmount.refIsNull).toBe(true);
    }
    expect(
        (await page.evaluate(() => window.__tri.pluginStats())).stable.cleanups,
        'unmount tears the running plugins down',
    ).toBe(1);
    await page.waitForTimeout(400);
    expect(
        channel(
            await page.evaluate(() => window.__tri.events()),
            'viewer-1',
            'statechange',
        ).callbackCount,
        'no stale callback fires after unmount',
    ).toBe(
        channel(eventsBeforeUnmount, 'viewer-1', 'statechange').callbackCount,
    );

    await page.evaluate(() => window.__tri.remountViewer1());
    await expect(v1Canvas).toHaveText(C2, { timeout: 30_000 });
    const afterRemount = await page.evaluate(() =>
        window.__tri.handleSnapshot(),
    );
    expect(afterRemount.v1.bound).toBe(true);
    expect(
        afterRemount.v1.stateId,
        'a remount binds a brand-new ViewerState',
    ).not.toBe(stateIdBefore);
    expect(
        (await page.evaluate(() => window.__tri.pluginStats())).stable
            .activations,
        'a remount re-activates the plugins',
    ).toBe(2);

    // 15. Vue only: a `<KeepAlive>` round trip rebinds and keeps updating.
    if (keepAlive) {
        const result = await page.evaluate(() =>
            window.__tri.keepAliveRoundTrip(),
        );
        expect(result.deactivated, '<KeepAlive> detached the element').toBe(
            true,
        );
        expect(
            result.rebound,
            '<KeepAlive> reactivation published a NEW ViewerState',
        ).toBe(true);
        await expect(v1Canvas).toHaveText(C2, { timeout: 30_000 });
        await page.evaluate((canvasId) => window.__tri.navigate(canvasId), C3);
        await expect(v1Canvas).toHaveText(C3, {
            timeout: 15_000,
        });
    }

    // ── Server route ───────────────────────────────────────────────────────
    const res = await page.request.get(`${baseURL}/ssr.html`);
    expect(res.ok(), 'the server-rendered route is served').toBe(true);
    const html = await res.text();

    expect(
        (html.match(/<triiiceratops-viewer/g) ?? []).length,
        'the server emits exactly one viewer host',
    ).toBe(1);
    const inner = /<div id="ssr-root">([\s\S]*?)<\/div>/.exec(html);
    expect(inner, 'the server-rendered root is present').not.toBeNull();
    expect(
        inner[1].trim(),
        'exactly one inert host, with no wrapper element and no children',
    ).toMatch(/^<triiiceratops-viewer[^>]*><\/triiiceratops-viewer>$/);
    expect(html).toContain(`manifest-id="${MANIFEST_ID}"`);
    expect(html).toContain(`canvas-id="${C2}"`);
    expect(html).toContain('theme="dark"');
    expect(html).toContain('id="ssr-viewer"');
    expect(html).toContain('data-ssr="yes"');
    expect(html).toContain('aria-label="Server rendered fixture viewer"');
    expect(inner[1]).toMatch(/style="[^"]*height/);
    for (const forbidden of [
        'manifestjson',
        'searchprovider',
        'themeconfig',
        'initialcanvasregion',
        'openseadragon',
        'viewer-root',
        'shadowroot',
    ]) {
        expect(
            html.toLowerCase().includes(forbidden),
            `the server must not emit ${forbidden}`,
        ).toBe(false);
    }

    await page.goto(`${baseURL}/ssr.html`, { waitUntil: 'load' });
    await expect
        .poll(() => page.evaluate(() => window.__ssr.ready()), {
            timeout: 30_000,
        })
        .toBe(true);
    const ssr = await page.evaluate(() => ({
        serverHostFound: window.__ssr.serverHostFound,
        hostReused: window.__ssr.hostReused(),
        hostUpgraded: window.__ssr.hostUpgraded(),
        recoverable: window.__ssr.recoverable,
        diagnostics: window.__ssr.diagnostics.filter((m) =>
            /hydrat|mismatch/i.test(m),
        ),
    }));
    expect(ssr.serverHostFound).toBe(true);
    expect(
        ssr.hostReused,
        'hydration reuses the very host node the server sent',
    ).toBe(true);
    expect(ssr.hostUpgraded, 'and the platform upgrades it').toBe(true);
    expect(ssr.recoverable, 'hydration reports no recoverable errors').toEqual(
        [],
    );
    expect(ssr.diagnostics, 'hydration logs no mismatch diagnostics').toEqual(
        [],
    );
    expect(
        await page.evaluate(() => window.__ssr.operate()),
        'the hydrated viewer is operable',
    ).toBe(C3);
    await expect(page.locator('#ssr-viewer canvas').first()).toBeVisible({
        timeout: 30_000,
    });

    // ── Conflict route ─────────────────────────────────────────────────────
    await page.goto(`${baseURL}/conflict.html`, { waitUntil: 'load' });
    await expect(page.locator('[data-testid="conflict-status"]')).toHaveText(
        'failed',
        { timeout: 15_000 },
    );
    const conflict = await page.evaluate(() => ({
        foreignOwnsTag: window.__conflict.foreignOwnsTag,
        elapsedMs: window.__conflict.elapsedMs,
        captured: window.__conflict.captured,
    }));
    expect(
        conflict.foreignOwnsTag,
        'importing the entry point left the foreign registration in place',
    ).toBe(true);
    expect(conflict.captured.length).toBeGreaterThan(0);
    const failure = conflict.captured[0];
    expect(failure.name).toBe('TriiiceratopsElementVersionError');
    expect(failure.code).toBe('ELEMENT_VERSION_CONFLICT');
    expect(failure.message).toContain('viewerState');
    expect(failure.message).toContain('triiiceratops-viewer');
    expect(
        conflict.elapsedMs,
        'the conflict is diagnosed promptly, not by timing out',
    ).toBeLessThan(5_000);

    // ── Page-wide hygiene ──────────────────────────────────────────────────
    expect(
        consoleMessages
            .filter((m) => /hydrat|mismatch/i.test(m.text))
            .map((m) => m.text),
        'no hydration-mismatch console messages anywhere in the journey',
    ).toEqual([]);
    expect(
        pageErrors.map((e) => e.message),
        'no uncaught page errors',
    ).toEqual([]);
}
