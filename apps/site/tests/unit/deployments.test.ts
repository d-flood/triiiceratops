/**
 * The deployments declaration, which is the one place the front page's strip and
 * `/production/` both read.
 *
 * What is asserted here is the shape the page's argument depends on: that every
 * entry names somebody and carries a link, that a reading room offers both the
 * landing page and the evidence, and that mkiiif is a second kind of entry
 * rather than a sixth reading room. Whether those links still resolve is verified
 * by hand when an entry is added, not here: the site cannot gate on the continued
 * existence of somebody else's server.
 */

import { describe, expect, it } from 'vitest';

import { DEPLOYMENTS } from '$lib/deployments';

describe('every deployment', () => {
    it('names its institution or project and says what it is', () => {
        for (const deployment of DEPLOYMENTS) {
            expect(deployment.who.trim().length).toBeGreaterThan(0);
            expect(deployment.what.trim().length).toBeGreaterThan(0);
        }
    });

    it('carries an absolute link out to somebody else’s site', () => {
        for (const deployment of DEPLOYMENTS) {
            for (const href of [deployment.href, deployment.example]) {
                if (href === undefined) continue;
                expect(href).toMatch(/^https:\/\//);
            }
        }
    });

    it('is listed once', () => {
        const hrefs = DEPLOYMENTS.map((deployment) => deployment.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});

describe('the reading rooms', () => {
    const readingRooms = DEPLOYMENTS.filter(
        (deployment) => deployment.kind === 'reading-room',
    );

    it('offer both the landing page and a viewer example', () => {
        // Two different claims: the first says who runs it, the second is the
        // evidence. A reading room with no example is an assertion, not proof.
        expect(readingRooms.length).toBeGreaterThan(0);
        for (const room of readingRooms) {
            expect(room.example).toBeDefined();
            expect(room.example).not.toBe(room.href);
        }
    });

    it('do not lead with the maintainer’s own project', () => {
        // Paleo Bench is the entry a sceptical reader discounts, so it is not
        // the one the page opens with.
        expect(readingRooms[0].who).not.toBe('Paleo Bench');
        expect(readingRooms.some((room) => room.who === 'Paleo Bench')).toBe(
            true,
        );
    });
});

describe('mkiiif', () => {
    const mkiiif = DEPLOYMENTS.find(
        (deployment) => deployment.who === 'mkiiif',
    );

    it('is declared as a tool rather than as a reading room', () => {
        expect(mkiiif?.kind).toBe('tool');
    });

    it('links no generated example while the published viewer renders it blank', () => {
        // Its generated pages load the viewer from the CDN unpinned, so they
        // stay blank until the level-0 fix is released. A link offered as
        // evidence that shows nothing is worse than no link.
        expect(mkiiif?.example).toBeUndefined();
    });
});
