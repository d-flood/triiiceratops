import { describe, expect, it, vi } from 'vitest';

import { scrollWithin } from './scrollWithin';

function box(top: number, height: number, left = 0, width = 100) {
    return {
        getBoundingClientRect: () =>
            ({
                top,
                bottom: top + height,
                height,
                left,
                right: left + width,
                width,
            }) as DOMRect,
    };
}

function scroller(top: number, height: number, left = 0, width = 100) {
    return {
        ...box(top, height, left, width),
        scrollTop: 50,
        scrollLeft: 10,
        scrollTo: vi.fn(),
    };
}

describe('scrollWithin', () => {
    it('centres the item vertically', () => {
        const view = scroller(0, 200);
        scrollWithin(view as never, box(300, 20) as never, 'center');
        expect(view.scrollTo).toHaveBeenCalledWith({
            left: 10,
            top: 50 + 300 - 90,
            behavior: 'auto',
        });
    });

    it('moves only as far as needed for nearest', () => {
        const view = scroller(0, 200);
        scrollWithin(view as never, box(190, 20) as never, 'nearest');
        expect(view.scrollTo).toHaveBeenLastCalledWith({
            left: 10,
            top: 60,
            behavior: 'auto',
        });

        scrollWithin(view as never, box(-30, 20) as never, 'nearest');
        expect(view.scrollTo).toHaveBeenLastCalledWith({
            left: 10,
            top: 20,
            behavior: 'auto',
        });

        scrollWithin(view as never, box(80, 20) as never, 'nearest');
        expect(view.scrollTo).toHaveBeenLastCalledWith({
            left: 10,
            top: 50,
            behavior: 'auto',
        });
    });

    it('also centres horizontally when asked', () => {
        const view = scroller(0, 200, 0, 300);
        scrollWithin(view as never, box(80, 20, 400, 100) as never, 'nearest', {
            inline: true,
            behavior: 'smooth',
        });
        expect(view.scrollTo).toHaveBeenCalledWith({
            left: 10 + 400 - 100,
            top: 50,
            behavior: 'smooth',
        });
    });
});
