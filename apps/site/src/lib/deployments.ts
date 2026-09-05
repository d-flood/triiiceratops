/**
 * Real deployments of the viewer, declared once.
 *
 * The front page's production strip and the `/production/` route both read this
 * list. Two hand-kept lists of the same deployments would disagree, and the
 * disagreement would be visible on adjacent pages.
 *
 * Every entry is a link a visitor can open into somebody's live reading room. A
 * deployment with no openable link does not belong here, and the list is never
 * padded: if only a few real deployments exist, the page lists a few. A dead
 * link on the page whose whole job is proof is worse than an absent entry, so
 * the links are checked by request rather than assumed.
 */

/**
 * What kind of adoption an entry is.
 *
 * A reading room is a collection a curator publishes and a reader browses. A
 * tool is software that emits the viewer into somebody else's pages — adoption
 * of the embed rather than a collection, and the page must not imply otherwise.
 */
export type DeploymentKind = 'reading-room' | 'tool';

export type Deployment = {
    /** The institution or project, named as it names itself. */
    readonly who: string;
    /** What the viewer is doing there, in one clause. */
    readonly what: string;
    /** Who runs it: the landing page a reader lands on. */
    readonly href: string;
    /**
     * The evidence: one page where the viewer is actually running.
     *
     * Absent only where no such page can honestly be linked yet.
     */
    readonly example?: string;
    readonly kind: DeploymentKind;
};

/**
 * Every deployment, verified by request on 2026-08-31, landing page and viewer
 * example each.
 *
 * Paleo Bench is the maintainer's own project, so it is the entry a sceptical
 * reader discounts: it stays, and it does not lead.
 *
 * mkiiif carries no example link. Its generated pages load the viewer from the
 * CDN unpinned, and the published version still renders a level-0 tile pyramid
 * blank, so every page it has generated is blank until the fix is released. A
 * link labelled as evidence that shows nothing is worse than no link.
 */
export const DEPLOYMENTS: readonly Deployment[] = [
    {
        who: 'CSNTM',
        what: 'The Center for the Study of New Testament Manuscripts’ photographed manuscript collection.',
        href: 'https://collections.csntm.org/',
        example: 'https://collections.csntm.org/manuscripts/MNTGRCP1',
        kind: 'reading-room',
    },
    {
        who: 'Mapping Color in History',
        what: 'Harvard’s pigment-analysis database, where the viewer shows the works the analyses are of.',
        href: 'https://mappingcolor.fas.harvard.edu/',
        example:
            'https://mappingcolor.fas.harvard.edu/works/chitra-darshana-nayika-the-heroine-who-gazes-at-a-picture-of-her-absent-beloved',
        kind: 'reading-room',
    },
    {
        who: 'Digital Giza',
        what: 'Harvard’s archive of the Giza Necropolis, reading excavation photography site by site.',
        href: 'https://giza.fas.harvard.edu/',
        example: 'https://giza.fas.harvard.edu/sites/5274/full/',
        kind: 'reading-room',
    },
    {
        who: 'Black Teacher Archive',
        what: 'The Harvard Graduate School of Education’s archive of the Colored Teachers Associations’ journals.',
        href: 'https://bta.gse.harvard.edu/',
        example: 'https://bta.gse.harvard.edu/collection/gut50000c05777',
        kind: 'reading-room',
    },
    {
        who: 'Paleo Bench',
        what: 'Palaeographic comparison of manuscript hands, side by side.',
        href: 'https://d-flood.github.io/paleo-bench/',
        example: 'https://d-flood.github.io/paleo-bench/compare',
        kind: 'reading-room',
    },
    {
        who: 'mkiiif',
        what: 'Raffaele Messuti’s Go command-line tool: it tiles an image, writes a IIIF v3 manifest, and emits a page carrying the viewer from the CDN.',
        href: 'https://github.com/atomotic/iiif',
        kind: 'tool',
    },
];
