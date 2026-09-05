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
 * clipboard, and the cross-surface round trip that is the reason the encoding
 * is single-sourced at all.
 */

import { expect, test, type Page } from '@playwright/test';

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
    await page.getByLabel('Information open').check();
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
    await expect(gallery).not.toBeChecked();
    await gallery.check();

    await expect(preview(page).locator('img').first()).toBeVisible();
    await expect(preview(page)).toHaveAttribute('data-e2e-mark', 'kept');

    // And the same for a theming token, which reaches the viewer by a different
    // input than the configuration does.
    await page.getByLabel('Viewer background').fill('#123456');
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
    // word, and which token is meant is exactly what the id says.
    for (const id of ['tok-primary', 'tok-viewerBg', 'tok-content']) {
        const swatch = page.locator(`#${id}`);
        await expect(swatch).toHaveValue(/^#[0-9a-f]{6}$/);
        // Black is what an unresolved token reads as, and no built-in theme
        // paints any of these three with it.
        await expect(swatch).not.toHaveValue('#000000');
    }
});

test('sends the reader to the playground for what it does not set', async ({
    page,
}) => {
    await page.goto('/configure/');

    const elsewhere = page.locator('section', {
        hasText: 'Viewing mode and viewing direction',
    });
    await expect(elsewhere).toContainText('playground');
    // Scoped to this section: the handoffs above send the reader to the same
    // place, for the same reason, and both links are the page keeping its word.
    await expect(
        elsewhere.getByRole('link', { name: 'playground', exact: true }),
    ).toHaveAttribute('href', '/demo/');
});

/** The clipboard, as the reader's next paste would see it. */
async function pasted(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
}

/** Sets exactly two options, and returns nothing else about the page. */
async function setTwo(page: Page): Promise<void> {
    await page.getByLabel('Gallery open').check();
    await page.getByLabel('Canvas nav edge').selectOption('top');
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
        // The manifest travels as a content state, which is the encoding the
        // playground reads too.
        expect(shared.searchParams.get('iiif-content')).toContain(EXAMPLE);
    });

    /*
     * A link built in the playground can declare a key whose value happens to
     * be this page's default. It is still what the sender chose, and the link
     * handed back has to still carry it: the two surfaces share one encoding,
     * so a round trip that quietly narrowed it would make the same query string
     * mean less on the second pass than on the first.
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

        // The colours reach the viewer by a different input than the
        // configuration does, so they are a second object rather than a key.
        await expect(
            page.getByRole('button', { name: 'Copy the theme configuration' }),
        ).toHaveCount(0);
        await page.getByLabel('Viewer background').fill('#123456');
        await page
            .getByRole('button', { name: 'Copy the theme configuration' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({ viewerBg: '#123456' });
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
        expect(html).toContain(`config='${JSON.stringify(TWO)}'`);
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

        await page.getByLabel('Gallery position').selectOption('left');
        await page
            .getByRole('button', { name: 'Copy the configuration object' })
            .click();
        expect(JSON.parse(await pasted(page))).toEqual({
            ...TWO,
            gallery: { open: true, dockPosition: 'left' },
        });
    });

    /**
     * One origin, one encoding, both surfaces. The string the builder produced
     * is pasted under the playground's path unchanged, and what the viewer is
     * handed there is read off the element's own `config` attribute — the input
     * it actually takes, rather than a control that happens to agree with it.
     */
    test('means the same thing under the playground’s path', async ({
        page,
    }) => {
        await page.goto('/configure/');
        await running(page);
        await setTwo(page);

        await page.getByRole('button', { name: 'Copy the share link' }).click();
        const shared = new URL(await pasted(page));

        await page.goto(`/demo/${shared.search}`);

        const viewer = page.locator('triiiceratops-viewer');
        await expect(viewer).toBeAttached({ timeout: 20_000 });

        const applied = JSON.parse(
            (await viewer.getAttribute('config')) ?? '{}',
        );
        expect(applied.gallery.open).toBe(true);
        expect(applied.nav.edge).toBe('top');

        // And in the running viewer, not only in what it was handed: the
        // gallery is banded because `gallery.open` arrived, and the nav sits
        // at the top because `nav.edge` did.
        await expect(viewer.locator('.gallery-band')).toBeAttached({
            timeout: 20_000,
        });
        await expect(viewer.locator('.viewer-root')).toHaveAttribute(
            'data-nav-edge',
            'top',
        );
        await expect(viewer).toHaveAttribute(
            'manifest-id',
            new RegExp(`${EXAMPLE}$`),
        );
    });
});
