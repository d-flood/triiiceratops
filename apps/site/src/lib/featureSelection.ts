/**
 * Which feature the single `/features/` stage is showing, as a shareable value.
 *
 * The page prerenders, so there is no query string at render time: the stage
 * serves the first feature and only reads the URL on mount, which is also why
 * this parsing lives in pure functions a unit test can hold to the contract
 * without a browser.
 *
 * The parameter is one-based (`?feature=2` is the second one) because the rail
 * reads "Feature 2 of 12" and a link carrying any other number for the same
 * feature would be a trap. Anything missing, unparseable, or out of range falls
 * back to the first feature rather than to an error: a shared link must never
 * open on nothing.
 */

export const FEATURE_PARAM = 'feature';

/** The zero-based index the stage should open on for this search string. */
export function parseFeatureIndex(search: string, total: number): number {
    const raw = new URLSearchParams(search).get(FEATURE_PARAM);
    if (raw === null) return 0;
    const oneBased = Number(raw);
    if (!Number.isInteger(oneBased)) return 0;
    if (oneBased < 1 || oneBased > total) return 0;
    return oneBased - 1;
}

/** The search string a switch to zero-based `at` should leave behind. */
export function featureSearch(at: number): string {
    return `?${FEATURE_PARAM}=${at + 1}`;
}
