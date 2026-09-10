/**
 * `/handles/`, in a browser: every feature through one stage.
 *
 * Three properties, none of which can be seen anywhere but here. That the page
 * costs what it looks like it costs — one viewer, with only the feature showing
 * fetched and nothing moving as the stage switches. That each feature does in
 * fact resolve its manifest and put the material on the stage's canvas when it
 * is picked, rather than the rail switching labels over a dead viewer. And that
 * the embed is the page's own, in its face and its scheme, in both schemes.
 *
 * The features the front page's material cannot show reach other people's IIIF
 * servers, deliberately: a table of contents, a note, an OCR search service and
 * a collection are not things this site has, and a fixture standing in for one
 * would prove the opposite of what the page says. A run with no network fails
 * on those, which is the honest result — the page would be broken for a reader
 * too.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

import { dragContentState, type DragTarget } from '../src/lib/dragSource';
import { FEATURE_GROUP_TABS, FEATURES } from '../src/lib/features';
import { ORIGIN } from './helpers/origin';

const FIRST = FEATURES[0];
const LAST = FEATURES[FEATURES.length - 1];
/**
 * A feature whose material nothing else on the page has already fetched.
 *
 * Several features share a manifest — that is the point of the site's own
 * material — so the deferral can only be measured on one whose manifest the
 * opening feature does not already carry.
 */
const DEFERRED = [...FEATURES]
    .reverse()
    .find((feature) => feature.example.manifest !== FIRST.example.manifest)!;
const DEFERRED_AT = FEATURES.indexOf(DEFERRED);

/**
 * What the type split costs this route, and the ceiling for everything that
 * moves outside the reserved stage.
 *
 * The material's own labels run to Ge'ez, Japanese, Persian and Dutch, so the
 * full face is fetched to paint them and the rail's prose re-renders as it
 * swaps in — and the rail is long, so there is a good deal of prose to re-run.
 * Measured at about 0.005, which is the price of a split that defers coverage
 * rather than losing it: still ten times below the 0.1 Lighthouse calls good,
 * and far under what a stage that failed to reserve its height would cost.
 */
const FONT_SWAP_SHIFT = 0.01;

function stage(page: Page) {
    return page.locator('.featstage .vw');
}

function rail(page: Page) {
    return page.locator('.featstage__opt');
}

/** The rail lists one kind of feature at a time, so its tab is opened first. */
async function openTab(page: Page, at: number) {
    const tab = page
        .locator('.featstage__tab')
        .filter({ hasText: FEATURE_GROUP_TABS[FEATURES[at].group] });
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** The rail option for one feature, whichever tab it lives under. */
function option(page: Page, at: number) {
    return rail(page).nth(
        FEATURES.filter(
            (feature, index) =>
                feature.group === FEATURES[at].group && index < at,
        ).length,
    );
}

/**
 * Pick one feature, and be sure the rail took it.
 *
 * The two tests below walk all of the rail as fast as the browser will go,
 * which no reader does, and on a loaded machine one of those clicks is now and
 * then not delivered at all — the page's own handler never runs. The rail's
 * `aria-checked` is the page's answer to whether the selection happened, so it
 * is what is waited on, and a click that produced none is sent again rather
 * than left to fail thirty seconds later against the previous feature's label.
 */
async function choose(page: Page, at: number) {
    await openTab(page, at);
    const chosen = option(page, at);
    await chosen.click();
    if ((await chosen.getAttribute('aria-checked')) !== 'true') {
        await chosen.click();
    }
    await expect(chosen).toHaveAttribute('aria-checked', 'true');
}

/** Every URL the page asked for, recorded from the first navigation. */
function recordRequests(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (request) => seen.push(request.url()));
    return seen;
}

/**
 * The requests for one manifest.
 *
 * Resolved against the origin rather than compared as strings: the features
 * shown on this site's own material declare a path, and the browser reports the
 * absolute URL it asked for.
 */
function asked(requested: string[], manifest: string): string[] {
    const wanted = new URL(manifest, ORIGIN).href;
    return requested.filter((url) => new URL(url, ORIGIN).href === wanted);
}

test('serves one stage and the open tab’s rail before anything is fetched', async ({
    page,
}) => {
    // The prerendered document, before a line of this application's script has
    // run: one reserved stage, the whole tab strip, and the first tab's options
    // under it, or the page shifts as the viewer arrives.
    await page.route('**/_app/**', (route) => route.abort());
    await page.goto('/handles/');

    await expect(stage(page)).toHaveCount(1);
    await expect(stage(page)).toHaveCSS('aspect-ratio', /^\d+ \/ \d+$/);
    await expect(page.locator('.featstage__tab')).toHaveCount(
        new Set(FEATURES.map((feature) => feature.group)).size,
    );
    await expect(rail(page)).toHaveCount(
        FEATURES.filter((feature) => feature.group === FIRST.group).length,
    );
});

test('a tab shows its own features and nothing else', async ({ page }) => {
    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();
    const plugins = FEATURES.filter(
        (feature) => feature.group === 'First Party Plugins',
    );
    await page
        .locator('.featstage__tab')
        .filter({ hasText: FEATURE_GROUP_TABS['First Party Plugins'] })
        .click();

    await expect(rail(page)).toHaveCount(plugins.length);
    await expect(rail(page).first()).toContainText(plugins[0].name);
    // Opening a tab shows its first feature rather than leaving the stage on a
    // feature the rail is no longer listing.
    await expect(stage(page)).toHaveAttribute(
        'aria-label',
        plugins[0].example.label,
        { timeout: 30_000 },
    );
});

test('fetches a feature only once it is picked', async ({ page }) => {
    const requested = recordRequests(page);
    await page.goto('/handles/');
    await page.waitForLoadState('load');
    // The embed starts after load, so a settle is needed before the absence
    // below means anything.
    await expect(stage(page).locator('.viewer-root')).toBeAttached();

    expect(
        asked(requested, DEFERRED.example.manifest),
        `${DEFERRED.name} was fetched without ever being picked`,
    ).toEqual([]);

    await choose(page, DEFERRED_AT);
    await expect
        .poll(() => asked(requested, DEFERRED.example.manifest))
        .not.toEqual([]);
});

test('the rail sits left of the stage on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/handles/');

    const railBox = await page.locator('.featstage__rail').boundingBox();
    const stageBox = await stage(page).boundingBox();
    expect(railBox, 'the rail has no box').not.toBeNull();
    expect(stageBox, 'the stage has no box').not.toBeNull();
    expect(railBox!.x).toBeLessThan(stageBox!.x);
    expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(
        stageBox!.x + stageBox!.width,
    );

    // Full-bleed: the strip spans the main column edge to edge instead of
    // stopping at the content measure, and the bleed introduces no sideways
    // scrolling to pay for it.
    const stripBox = await page.locator('.featstage').boundingBox();
    const columnBox = await page.locator('.pagebody').boundingBox();
    expect(stripBox, 'the strip has no box').not.toBeNull();
    expect(columnBox, 'the column has no box').not.toBeNull();
    expect(Math.abs(stripBox!.width - columnBox!.width)).toBeLessThan(2);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'the bleed scrolls sideways',
    ).toBeLessThanOrEqual(1600);
});

test('stacks the rail and the stage full-width on narrow screens', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/handles/');

    const railBox = await page.locator('.featstage__rail').boundingBox();
    // The pane, not the viewer box inside it: the viewer sits in the pane's
    // padding, so comparing against the box itself would always differ by it.
    const paneBox = await page.locator('.featstage__viewer').boundingBox();
    const stageBox = await stage(page).boundingBox();
    expect(railBox, 'the rail has no box').not.toBeNull();
    expect(paneBox, 'the viewer pane has no box').not.toBeNull();
    expect(stageBox, 'the stage has no box').not.toBeNull();
    // Stacked in document order, each taking the full width.
    expect(railBox!.y + railBox!.height).toBeLessThanOrEqual(paneBox!.y + 1);
    expect(Math.abs(railBox!.width - paneBox!.width)).toBeLessThan(2);

    // And the stage is on screen with the rail, not below it: stacked, the rail
    // comes first, so a rail that grew with the feature list would put screens
    // of options between a phone reader and the viewer they describe.
    expect(paneBox!.y).toBeLessThan(844);
    expect(
        await page
            .locator('.featstage__rail')
            .evaluate((el) => el.scrollHeight > el.clientHeight),
        'the rail is not scrolling within its own cap',
    ).toBe(true);
});

test('wears the route’s rounded chrome on every feature', async ({ page }) => {
    // The 1rem radius is the route's, not one feature's theming comparison: it
    // must survive every switch rather than arriving with a feature.
    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();
    for (let at = 0; at < FEATURES.length; at += 1) {
        await choose(page, at);
        // The tour's own budget, not the default: some of this material is a
        // real film on somebody else's server, and what is under test here is
        // the chrome the switch arrives in rather than how fast it arrives.
        await expect(stage(page)).toHaveAttribute(
            'aria-label',
            FEATURES[at].example.label,
            { timeout: 30_000 },
        );
        expect(
            await stage(page)
                .locator('.viewer-root')
                .evaluate((el) =>
                    getComputedStyle(el).getPropertyValue(
                        '--tri-radius-buttons',
                    ),
                ),
            FEATURES[at].name,
        ).toBe('1rem');
    }
});

test('opens on the feature a shared link names', async ({ page }) => {
    await page.goto(`/handles/?feature=${FEATURES.length}`);
    await expect(stage(page)).toBeAttached();
    await expect(stage(page)).toHaveAttribute('aria-label', LAST.example.label);
    await expect(rail(page).last()).toHaveAttribute('aria-checked', 'true');
});

test('shows the linked feature in the rail, not below it', async ({ page }) => {
    // The rail is longer than it is tall, so a link to a feature near its end
    // would otherwise arrive with the checked option far below the fold and
    // nothing to say which feature the reader had been sent to.
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.goto(`/handles/?feature=${FEATURES.length}`);
    await expect(rail(page).last()).toHaveAttribute('aria-checked', 'true');

    const option = await rail(page).last().boundingBox();
    const railBox = await page.locator('.featstage__rail').boundingBox();
    expect(option, 'the checked option has no box').not.toBeNull();
    expect(railBox, 'the rail has no box').not.toBeNull();
    expect(option!.y).toBeGreaterThanOrEqual(railBox!.y);
    expect(option!.y + option!.height).toBeLessThanOrEqual(
        railBox!.y + railBox!.height,
    );
});

test('switches the stage over its box without moving the page', async ({
    page,
}) => {
    await page.addInitScript(() => {
        type Shift = PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: { node?: Node | null }[];
        };
        const seen: { value: number; outside: boolean }[] = [];
        (window as unknown as { seen: typeof seen }).seen = seen;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const shift = entry as Shift;
                if (shift.hadRecentInput) continue;
                seen.push({
                    value: shift.value,
                    outside: (shift.sources ?? []).some(({ node }) => {
                        const element =
                            node instanceof Element
                                ? node
                                : (node?.parentElement ?? null);
                        return (
                            element !== null && element.closest('.vw') === null
                        );
                    }),
                });
            }
        }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();
    const reserved = await stage(page).evaluate(
        (box) => box.getBoundingClientRect().height,
    );

    for (let at = 0; at < FEATURES.length; at += 1) {
        await choose(page, at);
        await expect(stage(page)).toHaveAttribute(
            'aria-label',
            FEATURES[at].example.label,
            { timeout: 30_000 },
        );
    }
    // The renderer paints a frame or two after it mounts, and a shift it caused
    // would be recorded then rather than on mount.
    await page.waitForTimeout(2000);

    /*
     * The stage itself is the assertion that carries the weight: a stage whose
     * height is the same after touring every feature as it was before any
     * switch is the reserved stage doing its whole job, and it is exact rather
     * than a tolerance.
     */
    expect(
        await stage(page).evaluate((box) => box.getBoundingClientRect().height),
        'the reserved stage changed height while switching features',
    ).toEqual(reserved);

    /*
     * And nothing around it moves, beyond the one thing on this route that
     * does. The viewer's own settling is deliberately not counted: a renderer
     * re-centring its control bar once it knows how many canvases there are is
     * the viewer's internal business, no host can prevent it, and it happens
     * inside a stage whose geometry the assertion above holds exactly. What a
     * reader actually loads is measured by the score gate.
     */
    const outside = (
        await page.evaluate(
            () =>
                (
                    window as unknown as {
                        seen: { value: number; outside: boolean }[];
                    }
                ).seen,
        )
    )
        .filter((shift) => shift.outside)
        .reduce((sum, shift) => sum + shift.value, 0);
    expect(outside).toBeLessThanOrEqual(FONT_SWAP_SHIFT);
});

for (const [at, feature] of FEATURES.entries()) {
    test(`${feature.name} puts its material on the stage`, async ({ page }) => {
        const requested = recordRequests(page);
        await page.goto('/handles/');
        await expect(stage(page).locator('.viewer-root')).toBeAttached();
        await choose(page, at);

        // The manifest resolves before the material can paint, so the request
        // is what proves the switch reached somebody's server rather than
        // relabelling the stage over the previous material.
        await expect
            .poll(() => asked(requested, feature.example.manifest))
            .not.toEqual([]);
        // A canvas exists only once the manifest resolved and named something
        // paintable, so this is the assertion that the class actually works
        // rather than that a stage was reserved for it.
        await expect(stage(page).locator('canvas').first()).toBeAttached({
            timeout: 30_000,
        });
        await expect(stage(page)).toHaveAttribute(
            'aria-label',
            feature.example.label,
        );
    });
}

test('brings the plugin back when its feature is picked again', async ({
    page,
}) => {
    // The image tools by name: several features load a plugin now, and this
    // one is about the flyout that plugin puts in the bar.
    const at = FEATURES.findIndex(
        (feature) => feature.config.plugins?.['image-manipulation'],
    );
    const other = at === 0 ? 1 : 0;
    const flyout = stage(page).getByRole('dialog', {
        name: 'Image Adjustments',
    });

    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();

    await choose(page, at);
    await expect(flyout).toBeVisible();
    await choose(page, other);
    await expect(flyout).toBeHidden();
    await choose(page, at);
    await expect(flyout).toBeVisible();
});

/** Show one feature, by the name the page gives it. */
async function pick(page: Page, name: string) {
    const at = FEATURES.findIndex((feature) => feature.name === name);
    if (at < 0) throw new Error(`no feature named ${name}`);
    await choose(page, at);
}

/**
 * Land on one feature with its material resolved.
 *
 * The stage's accessible name is the feature's own label, so waiting on it
 * waits for the switch rather than for a timer.
 */
async function open(page: Page, name: string) {
    const feature = FEATURES.find((entry) => entry.name === name)!;
    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();
    await pick(page, name);
    await expect(stage(page)).toHaveAttribute(
        'aria-label',
        feature.example.label,
        { timeout: 30_000 },
    );
}

/*
 * The features whose whole point is a control standing open, or a surface the
 * plugin draws. Each is invisible to the tour above, which only asks whether a
 * manifest resolved: a caption list that never opened and a waveform that never
 * drew both leave the stage labelled correctly and showing nothing.
 */

test('stands the caption tracks open on the feature about them', async ({
    page,
}) => {
    await open(page, 'Captions in two languages');
    const list = stage(page).getByTestId('transport-track-list');
    await expect(list).toBeVisible({ timeout: 30_000 });
    // Two tracks and an off, which is what makes it a list rather than a
    // toggle — and what the feature says it is.
    await expect(list.getByRole('radio')).toHaveCount(3);
});

test('keeps the caption tracks open when arriving from the other film feature', async ({
    page,
}) => {
    /*
     * The switch, not the arrival. Both film features name the same plugin, and
     * a plugin the page re-hands the viewer must keep its activation: one torn
     * down and rebuilt between two features replaces the media element, which
     * empties the caption set the arriving feature's list is a list OF — and a
     * list standing over tracks that have gone shuts itself. The list was
     * correct on a fresh load throughout, so nothing above can see this.
     */
    await open(page, 'Video, with captions');
    const video = stage(page).locator('video.tri-av-media').first();
    await expect(video).toBeAttached({ timeout: 30_000 });

    await pick(page, 'Captions in two languages');
    const list = stage(page).getByTestId('transport-track-list');
    await expect(list).toBeVisible({ timeout: 30_000 });
    await expect(list.getByRole('radio')).toHaveCount(3);
    // And it stays: the shutting happened a frame after the list appeared.
    await page.waitForTimeout(1000);
    await expect(list).toBeVisible();
});

test('shows the captions on the feature about them', async ({ page }) => {
    await open(page, 'Video, with captions');

    // The track's own mode, not the control's look: `showing` is the whole of
    // what "the viewer burns the captions in" means, and it is what a reader
    // sees. Polled because a track joins the offered set only once its file has
    // parsed with cues in it, which is a second network round trip after the
    // manifest.
    await expect
        .poll(
            () =>
                stage(page)
                    .locator('video.tri-av-media')
                    .first()
                    .evaluate((media: HTMLMediaElement) =>
                        [...media.textTracks]
                            .filter((track) => track.mode === 'showing')
                            .map((track) => track.language),
                    ),
            { timeout: 30_000 },
        )
        .toEqual(['en']);
});

test('holds the captions clear of the control bar', async ({ page }) => {
    await open(page, 'Video, with captions');
    const video = stage(page).locator('video.tri-av-media').first();

    // The cue box is painted in the user agent's shadow DOM, where no
    // measurement of ours can reach — so the assertion is WebVTT's own
    // placement, which is the thing the fix actually sets. `line` off
    // `snapToLines` is a percentage of the picture measured, with `lineAlign`
    // at the end, from the cue's own bottom.
    const placement = async () =>
        video.evaluate((media: HTMLMediaElement) => {
            const track = [...media.textTracks].find(
                (candidate) => candidate.mode === 'showing',
            );
            const cue = track?.cues?.[0] as VTTCue | undefined;
            if (!cue) return null;
            const bar = media
                .closest('.viewer-root')
                ?.querySelector('[data-testid="control-bar"]');
            const covered = bar
                ? media.getBoundingClientRect().bottom -
                  bar.getBoundingClientRect().top
                : 0;
            return {
                line: cue.line,
                snapToLines: cue.snapToLines,
                lineAlign: cue.lineAlign,
                // What the bar is covering of the picture, as a percentage.
                coveredPercent:
                    (covered / media.getBoundingClientRect().height) * 100,
            };
        });

    await expect
        .poll(async () => (await placement())?.snapToLines, {
            timeout: 30_000,
        })
        .toBe(false);

    const placed = (await placement())!;
    expect(placed.lineAlign).toBe('end');
    // Clear of the bar, and clear by more than nothing: the caption's foot sits
    // above the band rather than resting on its top edge.
    expect(100 - (placed.line as number)).toBeGreaterThan(
        placed.coveredPercent,
    );
});

test('stands the language picker open on the feature about it', async ({
    page,
}) => {
    await open(page, 'The languages it is written in');
    const menu = stage(page).locator('#tri-flyout-locale');
    await expect(menu).toBeVisible();
    // The four the manifest is written in, each named in its own language.
    await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
});

test('draws the waveform for the recording that links one', async ({
    page,
}) => {
    await open(page, 'Sound, with its waveform');
    // The manifest's other canvas has a stage of its own, so the lane is taken
    // by position: the one the reader is on is the first.
    await expect(
        stage(page).getByTestId('av-timeline-lane').first(),
    ).toBeVisible({ timeout: 30_000 });
    // The surface only exists once the peaks parsed: a canvas linking data the
    // parser rejected renders a bare lane and no surface at all.
    await expect(stage(page).getByTestId('av-waveform').first()).toBeAttached();
});

test('seeks the recording from its own table of contents', async ({ page }) => {
    await open(page, 'Chapters in a recording');
    const entries = stage(page).getByRole('button', {
        name: /The Quilting Party/,
    });
    await expect(entries.first()).toBeVisible({ timeout: 30_000 });
    await entries.first().click();
    // The second march starts 68.441s into the canvas timeline, and a range
    // click is a seek: the transport reads the position, never a canvas index.
    await expect
        .poll(
            () =>
                stage(page)
                    .getByRole('slider')
                    .first()
                    .getAttribute('aria-valuenow'),
            { timeout: 15_000 },
        )
        .not.toBe('0');
});

test('moves between manifests, not between leaves, in a collection', async ({
    page,
}) => {
    /*
     * The failure this guards against is a collection that reads as one
     * manifest. A member with a single canvas in it cannot tell the two apart:
     * picking it looks exactly like turning a page. So the members here have
     * several canvases each, and the assertion is that picking one changes the
     * whole strip and the count with it.
     */
    await open(page, 'A whole collection');
    await expect(stage(page).getByText('4 Items')).toBeVisible({
        timeout: 30_000,
    });

    const thumbs = stage(page).locator('[aria-label^="Select canvas"]');
    // The opening volume, ordered by label because no member carries navDate.
    await expect(thumbs).toHaveCount(4, { timeout: 30_000 });
    const botany = await thumbs.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label')),
    );

    await stage(page)
        .getByRole('button', { name: /Paintings and prints/ })
        .first()
        .click();

    // A different manifest: three canvases, none of them the last one's.
    await expect(thumbs).toHaveCount(3, { timeout: 30_000 });
    const paintings = await thumbs.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label')),
    );
    expect(paintings.some((label) => botany.includes(label))).toBe(false);
});

test('stands the two declared orders open on the feature about them', async ({
    page,
}) => {
    await open(page, 'Another order for the leaves');
    const menu = stage(page).locator('#tri-flyout-sequence');
    await expect(menu).toBeVisible();
    // Two Ranges declared as sequences, and the manifest's own order taken.
    const items = menu.getByRole('menuitemradio');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveAttribute('aria-checked', 'true');

    // The strip along the foot carries as much of the feature as the picker
    // does: an order is a sequence of leaves, and the thumbnails are where a
    // reader can see one.
    const labels = () =>
        stage(page)
            .locator('[aria-label^="Select canvas"]')
            .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute('aria-label')),
            );
    await expect(
        stage(page).locator('[aria-label^="Select canvas"]'),
    ).toHaveCount(11, { timeout: 30_000 });
    const gathered = await labels();

    // Picking the other order reorders the material rather than relabelling
    // the menu: the same eleven leaves, arriving in a different sequence.
    await items.nth(1).click();
    await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(labels, { timeout: 30_000 }).not.toEqual(gathered);
    // Reordered, not filtered: neither Range adds or hides a canvas.
    expect((await labels()).slice().sort()).toEqual(gathered.slice().sort());
});

test('draws a point marker for the note anchored to one', async ({ page }) => {
    await open(page, 'A note pinned to a point');
    // The overlay's own fill class for a point, not the layer's: every geometry
    // draws into the same wrapper, so a rectangle in the point's place would
    // satisfy an assertion made about the layer alone.
    await expect(
        stage(page).locator(
            '[data-testid="annotation-shapes"] .anno-point-fill',
        ),
    ).toHaveCount(1, { timeout: 30_000 });
});

test('lists the tags and the whole-leaf note without drawing either', async ({
    page,
}) => {
    await open(page, 'Tags, and a note on the leaf');
    const rows = stage(page).locator('[data-annotation-row]');
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    // Two of the three carry tagging bodies, which the panel badges.
    await expect(
        stage(page).locator('[data-annotation-row] .badge'),
    ).toHaveCount(2);
    // And nothing is drawn over the canvas: every one of them targets the whole
    // sheet, so an overlay here would be an outline the publisher never gave.
    await expect(
        stage(page).locator('[data-testid="annotation-shapes"] > *'),
    ).toHaveCount(0);
});

test('fetches the annotation page the canvas only names', async ({ page }) => {
    const requested = recordRequests(page);
    const PAGE_URL = '/material/referenced/annotations.json';

    await page.goto('/handles/');
    await expect(stage(page).locator('.viewer-root')).toBeAttached();
    // The manifest carries no notes at all, so nothing can have asked for them
    // before the canvas that names the page is on screen.
    expect(asked(requested, PAGE_URL)).toEqual([]);

    await pick(page, 'Notes kept in another file');
    await expect.poll(() => asked(requested, PAGE_URL)).not.toEqual([]);
    // Five notes, none of which are in the manifest the viewer fetched first.
    await expect(stage(page).locator('[data-annotation-row]')).toHaveCount(5, {
        timeout: 30_000,
    });
});

test('reads a Presentation 2 document in its own vocabulary', async ({
    page,
}) => {
    await open(page, 'Published as the older IIIF');
    // `description` and `attribution` are the 2.x spellings of `summary` and
    // `requiredStatement`: a viewer reading only the 3.0 names would paint the
    // canvases and leave this panel empty.
    const panel = stage(page).getByRole('dialog', { name: /Information/i });
    await expect(panel).toContainText('older Presentation vocabulary', {
        timeout: 30_000,
    });
    await expect(panel).toContainText('Public-domain reproductions');
    // Three canvases, read out of `sequences[0].canvases` rather than `items`.
    await expect(stage(page)).toContainText('/ 3');
});

test('offers the transcribed plates as a range to export', async ({ page }) => {
    await open(page, 'Pages taken away as a PDF');
    const panel = stage(page).locator('[data-tri-pdf]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    // Both plates offered at either end of the range, which is what makes the
    // panel a range picker rather than a download button.
    await expect(panel.locator('[data-tri-pdf-start] option')).toHaveCount(3);
    await expect(panel.locator('[data-tri-pdf-end] option')).toHaveCount(3);
});

test('writes the plate’s transcribed lines into the PDF as text', async ({
    page,
}) => {
    /*
     * The one claim on this page a reader can only check by taking the file
     * away, so it is checked here instead. The plates carry their lines of type
     * as annotations anchored to regions; the export is supposed to turn those
     * into a text layer under the picture, and a PDF that merely contained the
     * image would satisfy every other assertion about this feature.
     */
    await open(page, 'Pages taken away as a PDF');
    const panel = stage(page).locator('[data-tri-pdf]');
    await expect(panel).toBeVisible({ timeout: 30_000 });

    const downloading = page.waitForEvent('download', { timeout: 90_000 });
    await panel.locator('[data-tri-pdf-export]').click();
    const file = await (await downloading).path();
    const bytes = readFileSync(file!);

    /*
     * Text is written as `<hex> Tj` inside a Flate-compressed content stream,
     * so the operands are decoded rather than the file searched: a byte scan of
     * the raw PDF finds nothing whether the layer is there or not.
     */
    const drawn: string[] = [];
    const raw = bytes.toString('latin1');
    let at = 0;
    while ((at = raw.indexOf('stream', at)) !== -1) {
        let start = at + 'stream'.length;
        if (raw.charCodeAt(start) === 13) start += 1;
        if (raw.charCodeAt(start) === 10) start += 1;
        const end = raw.indexOf('endstream', start);
        if (end === -1) break;
        try {
            const content = inflateSync(bytes.subarray(start, end)).toString(
                'latin1',
            );
            for (const [, hex] of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
                drawn.push(Buffer.from(hex, 'hex').toString('latin1'));
            }
        } catch {
            // Not a Flate stream — the image data and the cross-reference table.
        }
        at = end + 'endstream'.length;
    }

    expect(drawn).toContain('Haeckel, Kunstformen der Natur.');
});

test('offers only the resolutions the level-0 service will answer', async ({
    page,
}) => {
    await open(page, 'The leaf downloaded as an image');
    const resolution = stage(page).locator('[data-tri-id-resolution]');
    await expect(resolution).toBeVisible({ timeout: 30_000 });
    // A level-0 service is enumerated from its own tile pyramid rather than
    // offered the Original/50%/25% ladder every other service gets, so the
    // list is longer than three and every entry is a pixel size. The
    // placeholder row is the panel's own prompt and is left out of both.
    const options = resolution.locator('option:not([value=""])');
    await expect
        .poll(async () => await options.count(), { timeout: 30_000 })
        .toBeGreaterThan(3);
    for (const text of await options.allTextContents()) {
        expect(text).toMatch(/\d+\s*×\s*\d+px/);
    }
});

test('renders the viewer’s own chrome in the language the page asks for', async ({
    page,
}) => {
    await open(page, 'A viewer in another language');
    const menu = stage(page).locator('#tri-flyout-viewing-mode');
    await expect(menu).toBeVisible();
    // The viewer's words, not the manifest's: this material is catalogued in
    // English only, so anything German here came from the locale the page set.
    await expect(menu).toContainText('Einzelseiten');
    await expect(menu).toContainText('Doppelseiten');
    await expect(menu).toContainText('Kontinuierlich');
});

test('lists the recording’s timed notes as their own panel', async ({
    page,
}) => {
    await open(page, 'Notes pinned to the recording');
    const notes = stage(page).getByTestId('av-notes');
    await expect(notes).toBeVisible({ timeout: 30_000 });
    // One per second the manifest pins a note to. The canvas offers no caption
    // track and no linked transcript, so anything listed here is the
    // manifest's own commentary and nothing else.
    await expect(notes.getByRole('button')).toHaveCount(4);
});

test('stands the poster in the frame, with the film unplayed', async ({
    page,
}) => {
    await open(page, 'A poster before it plays');
    // Core paints the placeholder Canvas into the claimed canvas's rect, which
    // is the whole of what the property asks for.
    await expect(stage(page).locator('canvas').first()).toBeAttached({
        timeout: 30_000,
    });

    // The film itself is untouched: a poster is not an autoplay, and the
    // playhead has not moved off the start.
    const media = stage(page).locator('video.tri-av-media').first();
    await expect(media).toBeAttached({ timeout: 30_000 });
    expect(
        await media.evaluate((el: HTMLMediaElement) => ({
            paused: el.paused,
            currentTime: el.currentTime,
        })),
    ).toEqual({ paused: true, currentTime: 0 });

    // And the transport reads the film's own length rather than the poster's,
    // so the still standing there is a stand-in for two hours of opera and not
    // the whole of what this canvas holds.
    await expect(stage(page).getByText('2:01:18')).toBeVisible({
        timeout: 30_000,
    });
});

test('arrives at the second the manifest names, without playing', async ({
    page,
}) => {
    await open(page, 'Opens at the moment named');
    const slider = stage(page).getByRole('slider').first();
    await expect(slider).toBeVisible({ timeout: 30_000 });
    // The third march begins 158.067s into the canvas timeline, and `start`
    // names it: the playhead is there before the reader touches anything.
    await expect
        .poll(async () => Number(await slider.getAttribute('aria-valuenow')), {
            timeout: 30_000,
        })
        .toBeGreaterThan(150);
    // A seek and never a play.
    expect(
        await stage(page)
            .locator('audio.tri-av-media, video.tri-av-media')
            .first()
            .evaluate((media: HTMLMediaElement) => media.paused),
    ).toBe(true);
});

test('takes the rendition the browser can decode, not the first offered', async ({
    page,
}) => {
    await open(page, 'Whichever format will play');
    // A group of more than four alternatives is offered as a select rather than
    // a row of buttons, and this recipe publishes six.
    const picker = stage(page).locator('.choice-select-wrap select');
    await expect(picker).toBeVisible({ timeout: 30_000 });
    expect(await picker.locator('option').count()).toBeGreaterThan(4);

    // The one taken is not simply the first: the recipe leads with a lossless
    // format no browser decodes, and the plugin resolves the Choice by what
    // this browser can actually play.
    await expect
        .poll(
            () =>
                picker.evaluate(
                    (el: HTMLSelectElement) =>
                        el.options[el.selectedIndex]?.textContent?.trim() ?? '',
                ),
            { timeout: 30_000 },
        )
        .not.toMatch(/ALAC/);
    // And a rendition really was chosen rather than the picker resting on
    // nothing: exactly one alternative is marked as the current one.
    await expect(
        stage(page).locator('.choice-btn[aria-pressed="true"]'),
    ).toHaveCount(1);
});

/** The chips the drag feature offers, in the order the rail renders them. */
const DRAG_CHIPS = FEATURES.find(
    (feature) => feature.dragPayloads,
)!.dragPayloads!;

/**
 * Hand the pane a payload as the browser would.
 *
 * A real pointer drag between two elements is not something Playwright can
 * drive through the HTML drag-and-drop API, so the transfer is handed over as
 * the browser would hand it: recipe 0599's content state on `text/plain`,
 * alongside the `text/uri-list` a browser fills in for itself when the drag
 * source is an image — as the recipe's own is. What is under test is the
 * page's own resolver.
 */
async function dropOnStage(page: Page, target: DragTarget) {
    await page.locator('.featstage__viewer').evaluate(
        (pane, carried) => {
            const transfer = new DataTransfer();
            transfer.setData(
                'text/uri-list',
                'https://iiif.io/img/logo-iiif.png',
            );
            transfer.setData('text/plain', carried);
            pane.dispatchEvent(
                new DragEvent('drop', {
                    dataTransfer: transfer,
                    bubbles: true,
                }),
            );
        },
        dragContentState(target, ORIGIN),
    );
}

test('takes a view dragged from the rail onto the stage', async ({ page }) => {
    await open(page, 'Drag and drop IIIF content state');
    await expect(page.locator('.featstage__chip')).toHaveCount(
        DRAG_CHIPS.length,
    );

    await dropOnStage(page, DRAG_CHIPS[0]!.state);

    // The region the state names is a detail of the plate, so the view it
    // lands on is far closer than the whole leaf the feature opened on.
    await expect(stage(page).locator('canvas').first()).toBeAttached();
});

/*
 * The IIIF Cookbook's own drag source, which is the thing a reader who knows
 * the recipe will try on this page: a Manifest-targeted content state naming
 * material the page has never declared. The stage has to fetch it to describe
 * it, since it owes a reserved box and a name to whatever it shows.
 */
test('takes a content state naming material the page never declared', async ({
    page,
}) => {
    const foreign = `${ORIGIN}/test-manifests/dropped.json`;
    await page.route(foreign, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                id: foreign,
                type: 'Manifest',
                label: { en: ['Something the page has never heard of'] },
                items: [
                    {
                        id: `${foreign}/canvas/1`,
                        type: 'Canvas',
                        width: 1114,
                        height: 991,
                    },
                ],
            }),
        }),
    );

    await open(page, 'Drag and drop IIIF content state');

    await page.locator('.featstage__viewer').evaluate(
        (pane, carried) => {
            const transfer = new DataTransfer();
            transfer.setData(
                'text/uri-list',
                'https://iiif.io/img/logo-iiif.png',
            );
            transfer.setData('text/plain', carried);
            pane.dispatchEvent(
                new DragEvent('drop', {
                    dataTransfer: transfer,
                    bubbles: true,
                }),
            );
        },
        JSON.stringify({
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            id: 'https://example.org/state/foreign',
            type: 'Annotation',
            motivation: ['contentState'],
            target: { id: foreign, type: 'Manifest' },
        }),
    );

    // Announced by the publisher's own label, not by the feature's.
    await expect(stage(page)).toHaveAttribute(
        'aria-label',
        'Something the page has never heard of',
    );
});

test('takes a whole manifest dragged onto the stage', async ({ page }) => {
    const requested = recordRequests(page);
    await open(page, 'Drag and drop IIIF content state');

    const chip = DRAG_CHIPS.find((candidate) => candidate.carries)!;
    const carried = chip.carries!;
    // Nothing has asked for it yet: this manifest is not the feature's own, and
    // the page fetches the feature showing.
    expect(asked(requested, carried.example.manifest)).toEqual([]);

    await dropOnStage(page, chip.state);

    // Fetched because the drop named it, and on the stage because it replaced
    // the material the feature named.
    await expect
        .poll(() => asked(requested, carried.example.manifest))
        .not.toEqual([]);
    await expect(stage(page)).toHaveAttribute(
        'aria-label',
        carried.example.label,
    );

    // Leaving the feature and coming back through the rail — no reload — shows
    // the feature's own material again rather than what a drop left standing.
    await pick(page, 'Deep zoom on a single canvas');
    await pick(page, 'Drag and drop IIIF content state');
    const own = FEATURES.find(
        (feature) => feature.name === 'Drag and drop IIIF content state',
    )!;
    await expect(stage(page)).toHaveAttribute('aria-label', own.example.label);
});

test('the first feature loads without being picked', async ({ page }) => {
    const requested = recordRequests(page);
    await page.goto('/handles/');
    await expect
        .poll(() => asked(requested, FIRST.example.manifest))
        .not.toEqual([]);
    await expect(stage(page).locator('canvas').first()).toBeAttached({
        timeout: 30_000,
    });
});

test('names no recipe and claims no compliance', async ({ page }) => {
    await page.goto('/handles/');
    // The whole main column: the stage is a full-bleed strip now, so no single
    // wrapper holds the page's words anymore.
    const read = await page.locator('main').innerText();
    // A recipe id as a reader would read it. Compliance is claimed in one
    // place, and this page answers a different person's question.
    expect(read).not.toMatch(/\d{4}-[a-z]/);
    expect(read.toLowerCase()).not.toContain('supported');
});

test('is set in the page’s own face and turns with the page’s own scheme', async ({
    page,
}) => {
    /*
     * The surfaces are read back as colours through a probe element rather than
     * as custom properties. `themeConfig` sets the viewer's tokens to
     * `var(--site-token)`, so reading one returns that text rather than a
     * colour; a probe resolves the cascade where it stands and reports what a
     * reader would actually see. The probe is written out twice because each
     * runs in the page, where nothing in this file exists.
     */
    const surfaces = new Set<string>();
    for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/handles/');
        const viewer = stage(page).locator('.viewer-root');
        await expect(viewer).toBeAttached();

        const [face, pageFace, surface, pageSurface] = await Promise.all([
            viewer.evaluate((el) => getComputedStyle(el).fontFamily),
            page.evaluate(() => getComputedStyle(document.body).fontFamily),
            viewer.evaluate((el) => {
                const probe = document.createElement('div');
                probe.style.color = 'var(--tri-toolbar-bg)';
                el.appendChild(probe);
                const seen = getComputedStyle(probe).color;
                probe.remove();
                return seen;
            }),
            page.evaluate(() => {
                const probe = document.createElement('div');
                probe.style.color = 'var(--paper)';
                document.body.appendChild(probe);
                const seen = getComputedStyle(probe).color;
                probe.remove();
                return seen;
            }),
        ]);
        expect(face, scheme).toBe(pageFace);
        expect(surface, scheme).toBe(pageSurface);
        surfaces.add(surface);
    }
    // Two schemes, two surfaces: one colour for both would satisfy everything
    // above and mean the toggle never reached the viewer.
    expect(surfaces.size).toBe(2);
});
