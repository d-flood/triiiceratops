import { test, expect, type Page } from '@playwright/test';

/*
 * The built-in toolbar flyouts are rendered by one shared shell, so their
 * settled appearance is asserted here rather than inferred from the smoke test.
 * Every menu in every placement must land in the same geometry: the panel grows
 * away from the rail across a 24px gap (the WCAG 2.5.8 safe region between two
 * targets), centred on its toggle, with its rows stacked at one pitch.
 *
 * The assertions are relations — gap, centring, uniform pitch, row/column counts
 * — not captured pixel sizes, so they hold on any font stack while still pinning
 * placement, wrapping and the shell's own computed styles. They run on the
 * mobile projects too (`@mobile`), which is where wrapping actually differs.
 */

const MANIFEST = '/demo-manifests/a11y/manifest.json';

/** The gap the flyout keeps from its toggle, from `.menu-flyout`'s margin. */
const SAFE_GAP = 24;

// CSS anchor positioning is unimplemented in Firefox, which places these panels
// somewhere else entirely; the rest of the desktop matrix and both mobile
// projects cover the shell.
test.beforeEach(({ browserName }) => {
    test.skip(
        browserName === 'firefox',
        'CSS anchor positioning is not implemented in Firefox',
    );
});

async function loadViewer(page: Page, config?: object): Promise<void> {
    const query = config
        ? `&config=${encodeURIComponent(JSON.stringify(config))}`
        : '';
    await page.goto(`/e2e/harness.html?manifest=${MANIFEST}${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    await page
        .locator('[aria-controls="tri-flyout-gallery"]')
        .first()
        .waitFor({ timeout: 60000 });
}

type Box = { x: number; y: number; w: number; h: number };

interface Settled {
    actions: {
        classes: string[];
        flexDirection: string;
        flexWrap: string;
        buttons: number;
        rows: number;
        columns: number;
    };
    toggle: Box;
    panel: Box & {
        classes: string[];
        position: string;
        display: string;
        flexDirection: string;
        borderRadius: string;
        margin: string;
    };
    items: Box[];
}

/**
 * Open one built-in menu and read its settled layout. Polled rather than read
 * once: the panel animates in, and a single read lands mid-transition.
 */
async function settled(page: Page, menu: string): Promise<Settled> {
    await page.locator(`[aria-controls="tri-flyout-${menu}"]`).click();
    const read = async () =>
        page.evaluate((name) => {
            const root = document
                .querySelector('triiiceratops-viewer')!
                .shadowRoot!.querySelector('.viewer-root')!;
            const box = (el: Element) => {
                const b = el.getBoundingClientRect();
                return {
                    x: Math.round(b.x),
                    y: Math.round(b.y),
                    w: Math.round(b.width),
                    h: Math.round(b.height),
                };
            };
            const scoped = (el: Element) =>
                [...el.classList].filter((c) => !c.startsWith('svelte-'));
            const actions = root.querySelector('.actions')!;
            const buttons = [
                ...actions.querySelectorAll(':scope > li > button'),
            ];
            const toggle = root.querySelector(
                `[aria-controls="tri-flyout-${name}"]`,
            )!;
            const panel = root.querySelector(`#tri-flyout-${name}`)!;
            const panelStyle = getComputedStyle(panel);
            const actionsStyle = getComputedStyle(actions);
            return {
                actions: {
                    classes: scoped(actions).sort(),
                    flexDirection: actionsStyle.flexDirection,
                    flexWrap: actionsStyle.flexWrap,
                    buttons: buttons.length,
                    rows: new Set(buttons.map((b) => Math.round(box(b).y)))
                        .size,
                    columns: new Set(buttons.map((b) => Math.round(box(b).x)))
                        .size,
                },
                toggle: box(toggle),
                panel: {
                    ...box(panel),
                    classes: scoped(panel).sort(),
                    position: panelStyle.position,
                    display: panelStyle.display,
                    flexDirection: panelStyle.flexDirection,
                    borderRadius: panelStyle.borderRadius,
                    margin: panelStyle.margin,
                },
                items: [...panel.querySelectorAll(':scope > li > button')].map(
                    box,
                ),
            };
        }, menu);

    // Settle on the panel's own box: the open transition moves it, so two equal
    // reads mean the animation has finished.
    let previous = await read();
    await expect
        .poll(
            async () => {
                const next = await read();
                const same =
                    JSON.stringify(next.panel) ===
                    JSON.stringify(previous.panel);
                previous = next;
                return same;
            },
            { timeout: 10000 },
        )
        .toBe(true);
    return previous;
}

/** The rows stack at one pitch, all the same width, inside the panel. */
function assertStackedRows(view: Settled): void {
    expect(view.items.length).toBeGreaterThan(1);
    const widths = new Set(view.items.map((i) => i.w));
    expect(widths.size).toBe(1);
    const xs = new Set(view.items.map((i) => i.x));
    expect(xs.size).toBe(1);
    const pitches = new Set(
        view.items.slice(1).map((item, i) => item.y - view.items[i].y),
    );
    expect(pitches.size).toBe(1);
    expect([...pitches][0]).toBe(view.items[0].h);
    // The rows fill the panel: it is sized by them, not by a fixed height.
    const last = view.items[view.items.length - 1];
    expect(view.panel.y + view.panel.h - (last.y + last.h)).toBeLessThanOrEqual(
        2,
    );
}

/** A sideways menu clears the rail by the safe gap and is centred on its toggle. */
function assertSidewaysPlacement(view: Settled): void {
    expect(view.panel.x).toBe(view.toggle.x + view.toggle.w + SAFE_GAP);
    expect(
        Math.abs(
            view.panel.y +
                view.panel.h / 2 -
                (view.toggle.y + view.toggle.h / 2),
        ),
    ).toBeLessThanOrEqual(1);
    expect(view.panel.margin).toBe(`0px 0px 0px ${SAFE_GAP}px`);
}

function assertSharedShell(view: Settled): void {
    expect(view.panel.display).toBe('flex');
    expect(view.panel.flexDirection).toBe('column');
    expect(view.panel.borderRadius).toBe('16px');
    expect(view.panel.classes).toContain('menu');
    expect(view.panel.classes).toContain('popover-menu');
    expect(view.panel.classes).toContain('menu-flyout');
    expect(view.panel.classes).toContain('open');
}

test('toolbar flyout shells keep their settled placement and styles @mobile', async ({
    page,
}) => {
    test.slow();

    // --- Floating: the default overlay rail on the left edge. -------------
    await loadViewer(page);
    const floating = await settled(page, 'gallery');
    expect(floating.actions.classes).toEqual(['actions', 'left', 'menu']);
    expect(floating.actions.flexDirection).toBe('column');
    expect(floating.actions.columns).toBe(1);
    expect(floating.actions.rows).toBe(floating.actions.buttons);
    expect(floating.panel.position).toBe('absolute');
    expect(floating.panel.classes).toContain('right');
    assertSharedShell(floating);
    assertSidewaysPlacement(floating);
    assertStackedRows(floating);

    // The viewing-mode menu is a second instance of the same shell, so its
    // placement must agree with the gallery's to the pixel.
    const floatingModes = await settled(page, 'viewing-mode');
    assertSharedShell(floatingModes);
    assertSidewaysPlacement(floatingModes);
    assertStackedRows(floatingModes);
    expect(floatingModes.items[0].h).toBe(floating.items[0].h);

    // --- Docked: the in-flow screen-edge rail beside an open gallery. ------
    await loadViewer(page, { gallery: { open: true, dockPosition: 'left' } });
    const docked = await settled(page, 'gallery');
    expect(docked.actions.classes).toEqual([
        'actions',
        'docked',
        'left',
        'menu',
    ]);
    // The docked rail is a solid column that never wraps.
    expect(docked.actions.flexWrap).toBe('nowrap');
    expect(docked.actions.columns).toBe(1);
    expect(docked.actions.buttons).toBe(floating.actions.buttons);
    // Fixed, because the rail's own column clips overflow.
    expect(docked.panel.position).toBe('fixed');
    assertSharedShell(docked);
    assertSidewaysPlacement(docked);
    assertStackedRows(docked);

    // --- Inline: the buttons embedded in the unified control bar. ---------
    await loadViewer(page, { controls: 'unified' });
    const inline = await settled(page, 'gallery');
    expect(inline.actions.classes).toEqual([
        'actions',
        'horizontal',
        'inline',
        'menu',
    ]);
    expect(inline.actions.flexDirection).toBe('row');
    // One row, and one fewer button than the rail: inline drops the collapse
    // affordance, because the bar has nothing to collapse into.
    expect(inline.actions.rows).toBe(1);
    expect(inline.actions.columns).toBe(inline.actions.buttons);
    expect(inline.actions.buttons).toBe(floating.actions.buttons - 1);
    // Grows upward out of the bottom bar, over the same safe gap.
    expect(inline.panel.classes).toContain('up');
    expect(inline.toggle.y - (inline.panel.y + inline.panel.h)).toBe(SAFE_GAP);
    expect(
        Math.abs(
            inline.panel.x +
                inline.panel.w / 2 -
                (inline.toggle.x + inline.toggle.w / 2),
        ),
    ).toBeLessThanOrEqual(1);
    expect(inline.panel.margin).toBe(`0px 0px ${SAFE_GAP}px`);
    assertSharedShell(inline);
    assertStackedRows(inline);
    // Same rows, laid out at the bar's smaller control size.
    expect(inline.items.length).toBe(floating.items.length);
});
