/**
 * The editing round trip: the one new seam this work adds.
 *
 * It is driven against the real development server, and it asserts the file on
 * disk rather than that the storage backend was called or that a controller
 * emitted a document. Keystroke to file is the whole path and the only thing
 * that can really break; every lower assertion would describe the
 * implementation and miss it.
 *
 * The tests share one file on disk, so they run in order and each restores it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

const DOCUMENT = fileURLToPath(
    new URL('../content/handles.json', import.meta.url),
);

/** The autosave debounce plus room for the write, which is what "~1s" means. */
const ROUND_TRIP_MS = 1000;

type Node = { type: string; content?: Node[]; text?: string };

function document(): { content: Node[] } {
    return JSON.parse(readFileSync(DOCUMENT, 'utf8')) as { content: Node[] };
}

/** Each of the document's own blocks, as `type:text`, in the file's order. */
function blockOrder(): string[] {
    return document().content.map((node) => `${node.type}:${nodeText(node)}`);
}

function nodeText(node: Node): string {
    if (typeof node.text === 'string') return node.text;
    return (node.content ?? []).map(nodeText).join('');
}

/**
 * Put a collapsed caret at the very end of a block, by clicking past the end of
 * its last line.
 *
 * Collapsing a selection with an arrow key is not equivalent: a triple-click can
 * leave the editor holding a whole-node selection, which the next key replaces
 * rather than steps out of.
 */
async function caretAtEndOf(page: Page, block: Locator): Promise<void> {
    const box = await block.boundingBox();
    if (!box) throw new Error('the block has no box, so it is not rendered');
    await page.mouse.click(box.x + box.width - 1, box.y + box.height - 4);
}

/**
 * The editor's rich-text surface, once it holds the loaded document.
 *
 * The wait is on the document's own first line of prose, read from the file, so
 * it stays a wait for the load however the page's copy is rewritten.
 */
async function editor(page: Page): Promise<Locator> {
    const surface = page.locator('uncial-editor .ProseMirror');
    await expect(surface).toContainText(firstProse());
    return surface;
}

/** The first text the document carries, which is what the surface shows first. */
function firstProse(): string {
    for (const node of document().content) {
        const text = nodeText(node).trim();
        if (text) return text;
    }
    throw new Error('the document carries no text, so nothing marks it loaded');
}

const committed = readFileSync(DOCUMENT, 'utf8');

test.describe.configure({ mode: 'serial' });

/*
 * The page is closed before the file is restored. Tearing the editor down
 * cancels its pending autosave; restoring first lets a save scheduled by the
 * last keystroke land after the restore and leave the next test a document it
 * did not write.
 */
test.afterEach(async ({ page }) => {
    await page.close();
    writeFileSync(DOCUMENT, committed);
});

test.describe('a content route', () => {
    test('renders its document', async ({ page }) => {
        await page.goto('/handles/');

        const body = page.locator('main .doc');
        for (const heading of document().content.filter(
            (node) => node.type === 'heading',
        )) {
            await expect(
                body.getByRole('heading', {
                    name: nodeText(heading),
                    exact: true,
                    level: 2,
                }),
            ).toHaveCount(1);
        }
        await expect(body).toContainText(nodeText(document().content[1]));
    });
});

test.describe('the edit variant', () => {
    test('writes a keystroke to the backing document', async ({ page }) => {
        await page.goto('/handles/edit/');
        const surface = await editor(page);

        await surface.locator('> p').first().click();
        await page.keyboard.press('End');
        await page.keyboard.type(' Written by the round-trip spec.');

        await expect
            .poll(() => readFileSync(DOCUMENT, 'utf8'), {
                timeout: ROUND_TRIP_MS,
            })
            .toContain('Written by the round-trip spec.');
    });

    test('reflects a reorder of two blocks in the document’s block order', async ({
        page,
    }) => {
        await page.goto('/handles/edit/');
        const surface = await editor(page);
        const [heading, first, second, ...rest] = blockOrder();

        /*
         * The move an author makes in a rich-text editor: take the paragraph out
         * and put it back after the one that followed it. A triple-click selects
         * the paragraph; the `Backspace` after the cut removes the emptied
         * paragraph the cut leaves behind.
         */
        await surface.locator('> p').first().click({ clickCount: 3 });
        await page.keyboard.press('Control+x');
        await page.keyboard.press('Backspace');
        await expect
            .poll(blockOrder, { timeout: ROUND_TRIP_MS })
            .toEqual([heading, second, ...rest]);

        await caretAtEndOf(page, surface.locator('> p').first());
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+v');

        await expect
            .poll(blockOrder, { timeout: ROUND_TRIP_MS })
            .toEqual([heading, second, first, ...rest]);
    });

    test('renders the site’s own layout around the editor', async ({
        page,
    }) => {
        await page.goto('/handles/edit/');
        await editor(page);

        // The head, the rail, the next-page link and the footer: the measure and
        // rule weights a reader sees, which is the point of editing in place.
        await expect(
            page.getByRole('heading', { name: 'What it handles', level: 1 }),
        ).toHaveCount(1);
        await expect(page.locator('nav.rail')).toBeVisible();
        await expect(page.locator('footer.sitefoot')).toBeVisible();
        await expect(page.locator('a.next')).toBeVisible();
    });

    test('holds the prose at the read view’s measure, rhythm and weights', async ({
        page,
    }) => {
        const typography = (locator: Locator) =>
            locator.first().evaluate((node) => {
                const style = getComputedStyle(node);
                return {
                    width: Math.round(node.getBoundingClientRect().width),
                    font: style.font,
                    color: style.color,
                    margin: style.margin,
                };
            });

        await page.goto('/handles/');
        const read = await typography(
            page.locator('main .doc .uncial-content > p'),
        );

        await page.goto('/handles/edit/');
        await editor(page);
        const editing = await typography(
            page.locator('uncial-editor .ProseMirror > p'),
        );

        // The editing surface is a shadow root, so the site's prose rules reach
        // it only by naming the content root the renderer and the editor share.
        // A rule naming the wrapper around it instead leaves an author judging
        // copy at a spacing and a colour no reader is ever shown.
        expect(editing).toEqual(read);
    });

    test('leaves the rail navigable, so one page’s editor leads to the next', async ({
        page,
    }) => {
        await page.goto('/handles/edit/');
        await editor(page);

        await page.locator('nav.rail a[href="/configure/"]').click();

        await expect(page).toHaveURL(/\/configure\/$/);
    });
});
