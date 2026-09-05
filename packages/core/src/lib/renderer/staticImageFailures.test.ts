import { describe, expect, it } from 'vitest';

import { createStaticImageFailures } from './staticImageFailures';

describe('createStaticImageFailures', () => {
    it('remembers a failed URL and knows nothing about any other', () => {
        const failures = createStaticImageFailures();

        expect(failures.has('/a.png')).toBe(false);

        failures.record('/a.png');

        expect(failures.has('/a.png')).toBe(true);
        expect(failures.has('/b.png')).toBe(false);
    });

    /*
     * The whole reason this is keyed on the URL rather than on the canvas: a
     * canvas evicted from the residency window and scrolled back to resolves the
     * SAME url and must not be requested again, while a Choice switch on the same
     * canvas resolves a different one and must be.
     */
    it('answers per URL, so a Choice switch is a different question', () => {
        const failures = createStaticImageFailures();

        failures.record('/recto.png');

        expect(failures.has('/recto.png')).toBe(true);
        expect(failures.has('/verso.png')).toBe(false);
    });

    it('is idempotent: recording the same URL twice is one entry', () => {
        const failures = createStaticImageFailures(2);

        failures.record('/a.png');
        failures.record('/a.png');
        failures.record('/b.png');

        // Both survive, which they would not if the duplicate had counted
        // towards the ceiling.
        expect(failures.has('/a.png')).toBe(true);
        expect(failures.has('/b.png')).toBe(true);
    });

    /*
     * Page-shared and never expiring, so an unbounded set grows with every canvas
     * of every manifest a session opens. Oldest-first, like the metadata cache's
     * entry ceiling.
     */
    it('bounds what it remembers, dropping the oldest', () => {
        const failures = createStaticImageFailures(2);

        failures.record('/a.png');
        failures.record('/b.png');
        failures.record('/c.png');

        expect(failures.has('/a.png')).toBe(false);
        expect(failures.has('/b.png')).toBe(true);
        expect(failures.has('/c.png')).toBe(true);
    });

    /*
     * An `<img>` reports no status, so nothing here can be shown to be an answer
     * about the resource rather than about the network — and this cache outlives
     * the renderer, the manifest, and SPA navigation. Held for ever, one dropped
     * connection would blank that canvas for the rest of the page's life.
     */
    it('gives every failure another chance on a mount', () => {
        const failures = createStaticImageFailures();

        failures.record('/a.png');
        failures.retryAll();

        expect(failures.has('/a.png')).toBe(false);
    });
});
