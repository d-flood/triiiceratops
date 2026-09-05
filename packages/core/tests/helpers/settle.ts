/**
 * Wait for a laid-out value to stop moving.
 *
 * Why this exists as a shared helper rather than a line in each spec: the image
 * still MOVES while docked chrome slides in or out — core no longer re-fits it,
 * it compensates the reader's view in step with the slide — so a viewer that
 * opens beside a docked panel spends the first few hundred milliseconds
 * animating its projection. Every assertion that reads a
 * canvas-anchored box — and every click computed as a FRACTION of one — is
 * comparing two moments of that animation unless it waits for the end of it.
 */

import { expect, type Page } from '@playwright/test';

/**
 * The number of consecutive identical reads that count as settled.
 *
 * More than one, and that is the whole point. A single repeat is not evidence:
 * a slide has plateaux — most obviously at the start, before the transition
 * begins moving the box — and two equal reads across one are indistinguishable
 * from two equal reads after the motion has finished. The renderer's own settle
 * detection carries the same constant for the same reason.
 */
const STABLE_READS = 3;

/**
 * Poll `read` until it returns the same value `STABLE_READS` times running, and
 * answer with that value.
 *
 * Compared by `JSON.stringify`, so a plain object or array of numbers reads
 * naturally and a caller can settle several related measurements together —
 * which is usually what is wanted, since a box's `x` and `width` have to come
 * from the same moment to mean anything.
 */
export async function settled<T>(
    page: Page,
    read: (page: Page) => Promise<T>,
    timeout = 20_000,
): Promise<T> {
    let previous = JSON.stringify(await read(page));
    let unchanged = 0;
    let latest = await read(page);

    await expect
        .poll(
            async () => {
                latest = await read(page);
                const serialized = JSON.stringify(latest);
                if (serialized === previous) {
                    unchanged += 1;
                } else {
                    unchanged = 0;
                    previous = serialized;
                }
                return unchanged >= STABLE_READS;
            },
            { timeout, intervals: [50] },
        )
        .toBe(true);

    return latest;
}

/**
 * The settled bounding box of `selector` — the common case, and the one a click
 * position must be computed from.
 */
export async function settledBox(
    page: Page,
    selector: string,
    timeout = 20_000,
): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await settled(
        page,
        async (p) => await p.locator(selector).first().boundingBox(),
        timeout,
    );
    if (!box) throw new Error(`no bounding box for ${selector}`);
    return box;
}
