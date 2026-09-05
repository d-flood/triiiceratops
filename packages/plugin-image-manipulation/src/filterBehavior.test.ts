/**
 * Image-manipulation filter behavior units.
 *
 * These drive the plugin's real Flyout content through the SDK Test viewer
 * context (a real `ViewerState` with recording-double services), mounting via
 * the neutral `view.mount(container, context)` seam — the same call core's
 * chrome makes. They assert the externally observable filter behavior the SPEC
 * requires:
 *
 *   - a slider change lands as an image-adjustment command;
 *   - the adjustment LINGERS while nothing resets it (no "re-apply while closed"
 *     loop and no reset on its own — closing leaves the adjustment visible);
 *   - navigating to a different canvas resets filters to default;
 *   - deactivation (view cleanup) leaves NO residual adjustment on the shared
 *     viewer;
 *   - the plugin declares `dismiss: 'explicit'` and the core-chrome routing flag.
 *
 * Asserted on `viewerState.imageAdjustments`, not a DOM node's inline style:
 * the adjustment is observable state, so this suite needs no renderer at all
 * — what it asserts holds regardless of which renderer is mounted.
 */

import {
    createTestViewerContext,
    flush,
} from '@triiiceratops/plugin-sdk/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { catalog } from './catalog';
import { ImageManipulationPlugin } from './plugin';

describe('image-manipulation filter behavior', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('declares the flyout target and explicit dismiss', () => {
        expect(ImageManipulationPlugin.target).toBe('flyout');
        expect(ImageManipulationPlugin.dismiss).toBe('explicit');
    });

    it('issues an image-adjustment command when a slider changes, and it lingers', async () => {
        const tc = createTestViewerContext({ catalog });

        const cleanup = ImageManipulationPlugin.view.mount(
            container,
            tc.context,
        );
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        expect(brightness, 'the brightness slider renders').not.toBeNull();

        brightness!.value = '150';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));

        expect(tc.viewerState.imageAdjustments.brightness).toBe(150);

        // Linger: with no canvas change and no deactivation, the adjustment
        // stays put across a flush (there is no standing re-apply/reset loop).
        await flush();
        expect(tc.viewerState.imageAdjustments.brightness).toBe(150);

        cleanup();
    });

    it('applies the invert filter when the invert action is toggled', async () => {
        const tc = createTestViewerContext({ catalog });

        const cleanup = ImageManipulationPlugin.view.mount(
            container,
            tc.context,
        );
        await flush();

        const invert = container.querySelector<HTMLButtonElement>(
            '[data-tri-im-action="invert"]',
        );
        expect(invert).not.toBeNull();
        invert!.click();

        expect(tc.viewerState.imageAdjustments.invert).toBe(true);

        cleanup();
    });

    it('resets filters to default when the canvas changes (whether open or closed)', async () => {
        const tc = createTestViewerContext({ catalog });

        const cleanup = ImageManipulationPlugin.view.mount(
            container,
            tc.context,
        );
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        brightness!.value = '150';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(tc.viewerState.imageAdjustments.brightness).toBe(150);

        // Navigate to a different image: filters reset to neutral.
        tc.viewerState.canvasId = 'https://example.org/canvas/2';
        await flush();

        expect(tc.viewerState.imageAdjustments.brightness).toBe(100);

        cleanup();
    });

    it('leaves no residual adjustment on the shared viewer after deactivation', async () => {
        const tc = createTestViewerContext({ catalog });

        const cleanup = ImageManipulationPlugin.view.mount(
            container,
            tc.context,
        );
        await flush();

        const brightness = container.querySelector<HTMLInputElement>(
            'input[aria-label="Brightness"]',
        );
        brightness!.value = '50';
        brightness!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(tc.viewerState.imageAdjustments.brightness).toBe(50);

        // Deactivation runs the view cleanup, which resets the adjustment.
        cleanup();
        expect(tc.viewerState.imageAdjustments.brightness).toBe(100);
    });

    it('renders content only — no self-rendered toggle button', async () => {
        const tc = createTestViewerContext({ catalog });

        const cleanup = ImageManipulationPlugin.view.mount(
            container,
            tc.context,
        );
        await flush();

        // Core renders the toolbar button; the plugin content carries none.
        expect(container.querySelector('[data-tri-im-toggle]')).toBeNull();
        expect(container.querySelector('.tri-im-cluster')).not.toBeNull();

        cleanup();
    });
});
