// Plugin UI service (icon rendering) tests.
//
// Core owns the <svg> wrapper: it renders the descriptor's inner markup with
// core-chosen dimensions, currentColor fill, focusability, and aria-hidden, and
// removes it on cleanup.

import { afterEach, describe, expect, it } from 'vitest';

import { createPluginUiService } from './uiService';
import type { IconDescriptor } from '../types/plugin';

const DESCRIPTOR: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h10v10H0z"></path>',
    viewBox: '0 0 10 10',
};

let container: HTMLElement;

afterEach(() => {
    container?.remove();
});

describe('plugin UI service — renderIcon', () => {
    it('renders a core-owned <svg> wrapper carrying the descriptor', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const ui = createPluginUiService();

        const cleanup = ui.renderIcon(DESCRIPTOR, container);

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        // Core owns dimensions, viewBox, color, focusability, and a11y.
        expect(svg?.getAttribute('viewBox')).toBe('0 0 10 10');
        expect(svg?.getAttribute('fill')).toBe('currentColor');
        expect(svg?.getAttribute('focusable')).toBe('false');
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        // The descriptor's inner markup is injected.
        expect(svg?.querySelector('path')).not.toBeNull();

        cleanup();
        expect(container.querySelector('svg')).toBeNull();
    });
});
