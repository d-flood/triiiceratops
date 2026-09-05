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
 * the links are checked by request rather than assumed — see the check in
 * ticket 11's acceptance.
 */

export type Deployment = {
    /** The institution or project, named as it names itself. */
    readonly who: string;
    /** What the viewer is doing there, in one clause. */
    readonly what: string;
    /** A working link into the running deployment, not to a home page. */
    readonly href: string;
};

/**
 * Empty until the maintainer supplies the real entries.
 *
 * The design record records that the viewer is deployed in several projects
 * including a university library, but no URL for any of them exists anywhere in
 * this repository, and inventing or padding the list is explicitly out of scope.
 * The strip and the route both render nothing while this is empty rather than
 * showing a placeholder, because a placeholder deployment is exactly the claim
 * the section exists to make honestly.
 */
export const DEPLOYMENTS: readonly Deployment[] = [];
