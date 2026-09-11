/**
 * `/configure/`, in a browser: the three things about the builder that no unit
 * test can see.
 *
 * That a manifest the reader pastes actually reaches the preview — the whole
 * reason a share link from this page is worth sending is that it points at the
 * sender's own material. That a control changes the running viewer rather than
 * rebuilding it, because the argument the page makes is that chrome is
 * configuration and not a different build. And that a share URL's pair puts
 * both halves back, live, so the link a curator sends opens on what they saw.
 *
 * The one theming assertion here is the same kind of claim: the swatches open
 * on the viewer's own palette, read out of its stylesheet at runtime. A swatch
 * that came back black would mean the token scope had moved and every colour
 * control was starting from a lie.
 *
 * The second half of the file is the handoffs — the share URL, the
 * configuration object and the framework snippet — read back out of the
 * clipboard, and the round trip through this route's own URL that the encoding
 * exists for.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * What the builder opens on, and a second manifest to paste over it.
 *
 * The first is the front page's own local tile tree. The second is the site's
 * other static material, so the assertion about a pasted manifest arriving
 * depends on nobody's image server.
 */
const EXAMPLE = '/material/landing/manifest.json';
const OTHER = '/material/multi-target-array/manifest.json';

function preview(page: Page) {
    return page.locator('.pv__live .viewer-root');
}

/**
 * The editor's groups are tabs, so a control has to be reached before it can be
 * used. The tab is found from the control rather than named: every panel is in
 * the document whether or not it is showing, so which group offers a control is
 * a question the page can answer, and a control that moves group moves this
 * click with it instead of failing it.
 *
 * Reading a control needs none of this, for the same reason — a hidden panel's
 * inputs still hold their values.
 */
async function reach(page: Page, control: Locator) {
    const pane = await control.evaluate(
        (element) => element.closest('[role="tabpanel"]')!.id,
    );
    await page.locator(`[role="tab"][aria-controls="${pane}"]`).click();
    await expect(control).toBeVisible();
}

/** The viewer is imported after `load`, so every screen waits for it. */
async function running(page: Page) {
    await expect(preview(page)).toBeVisible({ timeout: 20_000 });
}

test('opens on the example manifest, and loads a manifest the reader pastes', async ({
    page,
}) => {
    await page.goto('/configure/');
    await running(page);

    const field = page.getByLabel('Your IIIF manifest');
    await expect(field).toHaveValue(EXAMPLE);

    // Open the information panel first, so what the pasted manifest resolves to
    // is readable from the manifest alone — the assertion is about the material
    // arriving, not about somebody else's image server answering.
    const information = page.getByLabel('Information open');
    await reach(page, information);
    await information.check();
    await expect(preview(page)).toContainText('Public-domain visual study set');

    const asked = page.waitForRequest((request) =>
        request.url().endsWith(OTHER),
    );
    await field.fill(OTHER);
    await page.getByRole('button', { name: 'Load' }).click();
    await asked;

    await expect(preview(page)).toContainText('Gottingen');
});

test('changes the preview without rebuilding the viewer', async ({ page }) => {
    await page.goto('/configure/');
    await running(page);

    // A mark on the live viewer's own root. If the element survives the change,
    // the mark does; if the viewer were remounted, a fresh element would not
    // carry it.
    await preview(page).evaluate((root) => {
        root.setAttribute('data-e2e-mark', 'kept');
    });

    const gallery = page.getByLabel('Gallery open');
    await reach(page, gallery);
    await expect(gallery).not.toBeChecked();
    await gallery.check();

    await expect(preview(page).locator('img').first()).toBeVisible();
    await expect(preview(page)).toHaveAttribute('data-e2e-mark', 'kept');

    // And the same for a theming token, which reaches the viewer by a different
    // input than the configuration does.
    const background = page.getByLabel('Viewer background');
    await reach(page, background);
    await background.fill('#123456');
    await expect(preview(page)).toHaveAttribute('style', /--tri-viewer-bg/);
    await expect(preview(page)).toHaveAttribute('data-e2e-mark', 'kept');
});

test('restores the configuration and the manifest a share URL carries', async ({
    page,
    baseURL,
}) => {
    const config = JSON.stringify({
        nav: { edge: 'top' },
        gallery: { open: true, dockPosition: 'left' },
        toolbar: { showSearch: false },
    });
    const contentState = new URL(OTHER, baseURL).href;

    const asked = page.waitForRequest((request) =>
        request.url().endsWith(OTHER),
    );
    /*
     * `mode` is a parameter the builder no longer emits. It is left in this URL
     * on purpose: links carrying one are in circulation, and what they promise
     * is that the view and the configuration still arrive.
     */
    await page.goto(
        `/configure/?mode=image&iiif-content=${encodeURIComponent(contentState)}&config=${encodeURIComponent(config)}`,
    );
    await running(page);
    await asked;

    await expect(page.getByLabel('Your IIIF manifest')).toHaveValue(
        contentState,
    );
    await expect(page.getByLabel('Canvas nav edge')).toHaveValue('top');
    await expect(page.getByLabel('Gallery position')).toHaveValue('left');
    await expect(page.getByLabel('Gallery open')).toBeChecked();
    await expect(page.getByLabel('Search', { exact: true })).not.toBeChecked();
});

test('opens its swatches on the viewer’s own palette', async ({ page }) => {
    await page.goto('/configure/');
    await running(page);

    // By id rather than by label: several controls' labels start with the same
    // word, and which token is meant is exactly what the id says. The three sit
    // in three different groups, and each is reached in turn.
    for (const key of ['primary', 'viewerBg', 'content']) {
        const swatch = page.locator(`#tok-${key}`);
        await reach(page, swatch);
        await expect(swatch).toHaveValue(/^#[0-9a-f]{6}$/);
        // Black is what an unresolved token reads as, and no built-in theme
        // paints any of these three with it.
        await expect(swatch).not.toHaveValue('#000000');
    }
});

/*
 * The theme is the ground the theming half reads through, so picking one has to
 * move every swatch a reader has not set — which is a claim about the probe
 * reading the viewer's stylesheet again under a different theme, and only a
 * browser can answer it.
 *
 * A reader is free to try the themes until they set a value of their own, and
 * then the choice is fixed: a theme moving under a colour somebody chose is the
 * one thing this control must not be able to do. `Start over` is the way back,
 * and it has to be a real one.
 */
test('starts the theming half from a built-in theme', async ({ page }) => {
    await page.goto('/configure/');
    await running(page);

    const swatch = page.locator('#tok-viewerBg');
    await reach(page, swatch);
    const scheme = await swatch.inputValue();

    // The switcher stands at the head of the theming half, so reaching any of
    // its tabs is reaching it.
    await expect(page.getByLabel('Light')).toBeChecked();
    await page.getByLabel('Dracula').check();

    await expect(swatch).not.toHaveValue(scheme);
    await expect(swatch).toHaveValue(/^#[0-9a-f]{6}$/);

    // Free to compare while nothing of the reader's own is at stake.
    await page.getByLabel('Teal').check();
    const teal = await swatch.inputValue();
    expect(teal).toMatch(/^#[0-9a-f]{6}$/);

    const chosen = '#123456';
    await swatch.fill(chosen);
    await expect(page.getByLabel('Teal')).toHaveCount(0);
    await expect(
        page.getByText('Started from Teal, with your own values over it.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Reset to Default' }).click();
    await expect(page.getByLabel('Light')).toBeChecked();
    await expect(swatch).toHaveValue(scheme);
});

/*
 * The preview stands on a named theme, always, and the snippet names the same
 * one: the overlays this page hands over are sparse, so an override means
 * nothing without the ground it departs from.
 *
 * Which theme a reader opens on is the scheme the page is in, so a reader
 * reading in dark is not handed a white viewer to work against.
 */
test.describe('the ground the preview stands on', () => {
    test('is a theme the viewer ships, named on the element', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);

        const swatch = page.locator('#tok-primary');
        await reach(page, swatch);

        await expect(preview(page)).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('.pv__probe')).toHaveAttribute(
            'data-theme',
            'light',
        );
        // A token with no theme in scope would come back black.
        await expect(swatch).not.toHaveValue('#000000');

        await page.getByLabel('Teal').check();
        await expect(preview(page)).toHaveAttribute('data-theme', 'teal');
        await expect(page.locator('.pv__probe')).toHaveAttribute(
            'data-theme',
            'teal',
        );
    });

    test.describe('for a reader reading in dark', () => {
        test.use({ colorScheme: 'dark' });

        test('is the dark theme rather than a white viewer', async ({
            page,
        }) => {
            await page.goto('/configure/');
            await running(page);

            await expect(preview(page)).toHaveAttribute('data-theme', 'dark');

            const swatch = page.locator('#tok-viewerBg');
            await reach(page, swatch);
            await expect(page.getByLabel('Dark')).toBeChecked();
            await expect(swatch).not.toHaveValue('#ffffff');
        });
    });
});

/*
 * Viewing mode and viewing direction override what the publisher declared, so
 * the builder has to be able to say nothing about them — and a reader who has
 * said something has to be able to take it back. Nothing below is visible to a
 * unit test: the retraction is only a retraction if the tracker reports it and
 * the overlay then drops it.
 */
test.describe('the two keys that override the manifest', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('start out following it, and can be handed back', async ({ page }) => {
        await page.goto('/configure/');
        await running(page);

        const mode = page.getByLabel('Viewing mode', { exact: true });
        await reach(page, mode);
        await expect(mode).toHaveValue('');

        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({});

        await mode.selectOption('paged');
        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({
            viewingMode: 'paged',
        });

        // Back to following the manifest: the key goes, rather than being
        // handed to a developer as a line that says nothing.
        await mode.selectOption('');
        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({});
    });
});

/** The clipboard, as the reader's next paste would see it. */
async function pasted(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
}

/** Sets exactly two options, and returns nothing else about the page. */
async function setTwo(page: Page): Promise<void> {
    const gallery = page.getByLabel('Gallery open');
    await reach(page, gallery);
    await gallery.check();

    const edge = page.getByLabel('Canvas nav edge');
    await reach(page, edge);
    await edge.selectOption('top');
}

const TWO = { gallery: { open: true }, nav: { edge: 'top' } };

test.describe('what a reader leaves with', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('puts only the keys the reader set in the share URL', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page.getByRole('button', { name: 'Copy the share link' }).click();
        const shared = new URL(await pasted(page));

        expect(shared.pathname).toBe('/configure/');
        expect(JSON.parse(shared.searchParams.get('config') ?? '{}')).toEqual(
            TWO,
        );
        // The manifest travels as a content state, which is the encoding
        // `/viewer/` reads too.
        expect(shared.searchParams.get('iiif-content')).toContain(EXAMPLE);
    });

    /*
     * A link can declare a key whose value happens to be this page's default —
     * a colleague who set it deliberately, or a developer who wrote the query
     * string by hand. It is still what the sender chose, and the link handed
     * back has to still carry it: a round trip that quietly narrowed it would
     * make the same query string mean less on the second pass than on the
     * first.
     */
    test('keeps a key the link declared at this page\u2019s own default', async ({
        page,
    }) => {
        const declared = { showToggle: true, gallery: { size: 100 } };
        await page.goto(
            `/configure/?config=${encodeURIComponent(JSON.stringify(declared))}`,
        );
        await running(page);

        await page.getByRole('button', { name: 'Copy the share link' }).click();
        const shared = new URL(await pasted(page));

        expect(JSON.parse(shared.searchParams.get('config') ?? '{}')).toEqual(
            declared,
        );
    });

    test('restores both when that URL is opened again', async ({ page }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page.getByRole('button', { name: 'Copy the share link' }).click();
        const shared = new URL(await pasted(page));

        await page.goto(shared.pathname + shared.search);
        await running(page);

        await expect(page.getByLabel('Gallery open')).toBeChecked();
        await expect(page.getByLabel('Canvas nav edge')).toHaveValue('top');
        await expect(page.getByLabel('Your IIIF manifest')).toHaveValue(
            new RegExp(`${EXAMPLE}$`),
        );
    });

    test('copies the configuration object, and the theming half separately', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual(TWO);

        /*
         * The colours reach the viewer by a different input than the
         * configuration does, so they are a second object rather than a key.
         * It is on the page from the start, empty, because a reader watching
         * two objects fill in has to be able to see which of them a control
         * writes to.
         */
        const theme = page.getByRole('button', {
            name: 'Copy the theme configuration',
        });
        await theme.click();
        expect(JSON.parse(await pasted(page))).toEqual({});

        const background = page.getByLabel('Viewer background');
        await reach(page, background);
        await background.fill('#123456');
        await theme.click();
        expect(JSON.parse(await pasted(page))).toEqual({ viewerBg: '#123456' });
    });

    /*
     * A plugin is a module, so it can only travel in a snippet. Turning one on
     * has to reach the code the reader copies and the viewer they are watching,
     * and reach neither the configuration object nor the link — which is the
     * whole reason it is a separate answer rather than a configuration key.
     */
    test('registers the plugins a reader turned on', async ({ page }) => {
        await page.goto('/configure/');
        await running(page);

        // The toolbar opens first: a plugin's button lives in it, and this
        // page's defaults start it closed.
        const open = page.getByLabel('Open the toolbar to begin with');
        await reach(page, open);
        await open.check();

        const tools = page.getByLabel('Image tools');
        await reach(page, tools);
        await tools.check();

        // The plugin's own toolbar button, in the running viewer.
        await expect(
            preview(page).getByRole('button', { name: 'Image Adjustments' }),
        ).toBeVisible({ timeout: 20_000 });

        await page.getByRole('tab', { name: 'Svelte', exact: true }).click();
        await page
            .getByRole('button', { name: 'Copy the Svelte snippet' })
            .click();
        const snippet = await pasted(page);
        expect(snippet).toContain(
            "import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';",
        );
        expect(snippet).toContain('const plugins = [ImageManipulationPlugin];');
        expect(snippet).toContain('{plugins}');

        // And the configuration carries only what a configuration can: the
        // toolbar key, and nothing at all about the plugin.
        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({ toolbarOpen: true });
    });

    test('names the theme a reader started from in the code, and nowhere else', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);

        const swatch = page.locator('#tok-viewerBg');
        await reach(page, swatch);
        await page.getByLabel('Dracula').check();

        await page.getByRole('tab', { name: 'Svelte', exact: true }).click();
        await page
            .getByRole('button', { name: 'Copy the Svelte snippet' })
            .click();
        expect(await pasted(page)).toContain('theme="dracula"');

        /*
         * A theme is the viewer's own input rather than a key of either
         * overlay, and it is a name rather than a value a URL could carry. So
         * neither copyable object says anything about it.
         */
        await page
            .getByRole('button', { name: 'Copy the theme configuration' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({});

        await page.getByRole('button', { name: 'Copy the share link' }).click();
        expect(await pasted(page)).not.toContain('dracula');
    });

    /*
     * The overlay is what a reader would have to state to get the viewer they
     * are looking at. A value put back where it started is not part of that:
     * they decided about it and then undecided, and a key still standing in the
     * link would hand somebody else something its own sender no longer means.
     */
    test('drops a value the reader put back where it started', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);

        const gallery = page.getByLabel('Gallery open');
        await reach(page, gallery);
        await gallery.check();

        const query = page.getByLabel('Search the manifest for this on load');
        await reach(page, query);
        await query.fill('whale');

        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({
            gallery: { open: true },
            search: { query: 'whale' },
        });

        await query.fill('');
        await reach(page, gallery);
        await gallery.uncheck();

        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({});
    });

    test('copies a snippet for the framework the reader picked', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page
            .getByRole('button', { name: 'Copy the HTML snippet' })
            .click();
        const html = await pasted(page);
        expect(html).toContain('<triiiceratops-viewer');
        // Parsed rather than matched as a string: the overlay is emitted in the
        // configuration's own key order, which is not what this asserts.
        expect(JSON.parse(html.match(/config='(.*)'/)?.[1] ?? '{}')).toEqual(
            TWO,
        );
        expect(html).toContain(EXAMPLE);

        await page.getByRole('tab', { name: 'React' }).click();
        await page
            .getByRole('button', { name: 'Copy the React snippet' })
            .click();
        const react = await pasted(page);
        expect(react).toContain("from 'triiiceratops/react'");
        expect(react).toContain('edge: ');
        // A default the builder started from is nobody's intent.
        expect(react).not.toContain('leftPanelWidth');
    });

    test('reflects the state at the moment of the copy, not the one before', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual(TWO);

        // The same group as the edge `setTwo` set, so its tab is already open.
        await page.getByLabel('Gallery position').selectOption('left');
        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({
            ...TWO,
            gallery: { open: true, dockPosition: 'left' },
        });
    });
});
