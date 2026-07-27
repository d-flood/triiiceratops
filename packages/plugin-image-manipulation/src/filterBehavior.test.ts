/**
 * Image-manipulation filter behavior units (epic restore-plugin-toolbar-chrome,
 * ticket 03).
 *
 * These drive the plugin's real Flyout content through the SDK Test viewer
 * context (a real `ViewerState` with recording-double services and an injectable
 * OSD stub), mounting via the neutral `view.mount(container, context)` seam — the
 * same call core's chrome makes. They assert the externally observable filter
 * behavior the SPEC requires:
 *
 *   - a slider change writes the CSS filter to the raw OSD canvas (ADR 0009);
 *   - the filter LINGERS while nothing resets it (no "re-apply while closed"
 *     loop and no reset on its own — closing leaves the adjustment visible);
 *   - navigating to a different canvas resets filters to default;
 *   - deactivation (view cleanup) leaves NO residual filter on the shared canvas;
 *   - the plugin declares `dismiss: 'explicit'` and the core-chrome routing flag.
 *
 * OSD is a minimal stub: this plugin only touches `drawer.canvas`, whose inline
 * `style.filter` is where `applyFilters` writes.
 */

import {
    createTestViewerContext,
    flush,
} from '@triiiceratops/plugin-sdk/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { catalog } from './catalog';
import { ImageManipulationPlugin } from './plugin';

/** A stub OSD viewer exposing only the drawer canvas the plugin filters. */
function makeOsdStub(): { drawer: { canvas: HTMLElement } } {
    return { drawer: { canvas: document.createElement('div') } };
}

describe('image-manipulation filter behavior', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('declares the flyout target, explicit dismiss, and the core-chrome flag', () => {
        expect(ImageManipulationPlugin.target).toBe('flyout');
        expect(ImageManipulationPlugin.dismiss).toBe('explicit');
        expect(ImageManipulationPlugin.__coreChrome).toBe(true);
    });

    it('writes the CSS filter to the OSD canvas when a slider changes, and it lingers', async () => {
        const tc = createTestViewerContext({ catalog });
        const osd = makeOsdStub();
        tc.setOsdViewer(osd);
        await flush();

        const cleanup = ImageManipulationPlugin.view.mount(container, tc.context);
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        expect(brightness, 'the brightness slider renders').not.toBeNull();

        brightness!.value = '150';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));

        expect(osd.drawer.canvas.style.filter).toContain('brightness(1.5)');

        // Linger: with no canvas change and no deactivation, the inline filter
        // stays put across a flush (there is no standing re-apply/reset loop).
        await flush();
        expect(osd.drawer.canvas.style.filter).toContain('brightness(1.5)');

        cleanup();
    });

    it('applies the invert filter when the invert action is toggled', async () => {
        const tc = createTestViewerContext({ catalog });
        const osd = makeOsdStub();
        tc.setOsdViewer(osd);
        await flush();

        const cleanup = ImageManipulationPlugin.view.mount(container, tc.context);
        await flush();

        const invert = container.querySelector<HTMLButtonElement>(
            '[data-tri-im-action="invert"]',
        );
        expect(invert).not.toBeNull();
        invert!.click();

        expect(osd.drawer.canvas.style.filter).toContain('invert(1)');

        cleanup();
    });

    it('resets filters to default when the canvas changes (whether open or closed)', async () => {
        const tc = createTestViewerContext({ catalog });
        const osd = makeOsdStub();
        tc.setOsdViewer(osd);
        await flush();

        const cleanup = ImageManipulationPlugin.view.mount(container, tc.context);
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        brightness!.value = '150';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(osd.drawer.canvas.style.filter).toContain('brightness(1.5)');

        // Navigate to a different image: filters reset, clearing the canvas.
        tc.viewerState.canvasId = 'https://example.org/canvas/2';
        await flush();

        expect(osd.drawer.canvas.style.filter).toBe('none');

        cleanup();
    });

    it('leaves no residual filter on the shared canvas after deactivation', async () => {
        const tc = createTestViewerContext({ catalog });
        const osd = makeOsdStub();
        tc.setOsdViewer(osd);
        await flush();

        const cleanup = ImageManipulationPlugin.view.mount(container, tc.context);
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        brightness!.value = '50';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(osd.drawer.canvas.style.filter).toContain('brightness(0.5)');

        // Deactivation runs the view cleanup, which resets the canvas filter.
        cleanup();
        expect(osd.drawer.canvas.style.filter).toBe('none');
    });

    it('renders content only — no self-rendered toggle button', async () => {
        const tc = createTestViewerContext({ catalog });
        tc.setOsdViewer(makeOsdStub());
        await flush();

        const cleanup = ImageManipulationPlugin.view.mount(container, tc.context);
        await flush();

        // Core renders the toolbar button; the plugin content carries none.
        expect(container.querySelector('[data-tri-im-toggle]')).toBeNull();
        expect(container.querySelector('.tri-im-cluster')).not.toBeNull();

        cleanup();
    });
});
