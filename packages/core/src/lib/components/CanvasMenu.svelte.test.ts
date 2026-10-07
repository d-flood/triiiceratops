import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ViewerControlsTestHost from './ViewerControlsTestHost.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';

const MANIFEST = 'http://example.org/manifest/canvas-menu';
const ids = Array.from(
    { length: 12 },
    (_, i) => `http://example.org/canvas-menu/${i + 1}`,
);

const manifest = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: MANIFEST,
    type: 'Manifest',
    label: { en: ['Canvas menu fixture'] },
    items: ids.map((id, i) => ({
        id,
        type: 'Canvas',
        label: { en: [`f. ${i + 1}r`] },
        height: 1000,
        width: 800,
        items: [],
    })),
};

describe('canvas menu', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let state: ViewerState;

    beforeEach(async () => {
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            },
        );
        state = new ViewerState();
        await state.setManifestData(MANIFEST, manifest);
        state.viewingMode = 'individuals';
        state.canvasId = ids[0];
    });

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        manifestsState.clearManifest(MANIFEST);
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    function render() {
        mounted = mount(ViewerControlsTestHost, {
            target: document.body,
            props: { viewerState: state },
        });
        flushSync();
    }

    const trigger = () =>
        document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
    const rows = () =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>('.canvas-list .row'),
        );
    const end = (label: string) =>
        Array.from(
            document.querySelectorAll<HTMLButtonElement>(
                '.canvas-list .ends button',
            ),
        ).find((button) => button.textContent?.trim() === label)!;

    function openMenu() {
        trigger().click();
        flushSync();
    }

    it('shows the position on a button that opens the canvas list', () => {
        render();
        expect(trigger().textContent?.trim()).toBe('1 / 12');
        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        expect(menu()).toBeNull();

        openMenu();

        expect(trigger().getAttribute('aria-expanded')).toBe('true');
        expect(state.openMenu).toBe('canvases');
        expect(rows().map((row) => row.textContent?.trim())).toEqual(
            ids.map((_, i) => `${i + 1}. f. ${i + 1}r`),
        );
        expect(rows()[0].getAttribute('aria-current')).toBe('true');
    });

    it('goes to the chosen canvas and closes', () => {
        render();
        openMenu();

        rows()[6].click();
        flushSync();

        expect(state.canvasId).toBe(ids[6]);
        expect(menu()).toBeNull();
        expect(trigger().textContent?.trim()).toBe('7 / 12');
    });

    it('jumps to the first and last canvas, disabling the one already shown', () => {
        render();
        openMenu();
        expect(end('First').disabled).toBe(true);

        end('Last').click();
        flushSync();
        expect(state.canvasId).toBe(ids[11]);

        openMenu();
        expect(end('Last').disabled).toBe(true);
        end('First').click();
        flushSync();
        expect(state.canvasId).toBe(ids[0]);
    });

    it('puts First and Last nearest the bar on the edge it is docked to', () => {
        render();
        openMenu();
        const below = Array.from(menu()!.children).map((el) => el.className);
        expect(below.at(-1)).toContain('ends');

        state.setOpenMenu(null);
        state.config.nav = { edge: 'top' };
        flushSync();
        openMenu();
        const above = Array.from(menu()!.children).map((el) => el.className);
        expect(menu()!.classList.contains('down')).toBe(true);
        expect(above[0]).toContain('ends');
    });

    it('orders First and Last the way the nav arrows read', () => {
        state.viewingDirection = 'right-to-left';
        render();
        openMenu();
        const labels = Array.from(
            document.querySelectorAll('.canvas-list .ends button'),
        ).map((button) => button.textContent?.trim());
        expect(labels).toEqual(['Last', 'First']);
    });

    it('marks the whole spread and lands on its first page in paged mode', () => {
        state.viewingMode = 'paged';
        state.canvasId = ids[1];
        render();
        openMenu();

        const current = rows()
            .map((row, i) => (row.getAttribute('aria-current') ? i : -1))
            .filter((i) => i >= 0);
        expect(current).toEqual([1, 2]);

        rows()[4].click();
        flushSync();
        expect(state.canvasId).toBe(ids[3]);
    });
});
