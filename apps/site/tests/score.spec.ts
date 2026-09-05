/**
 * The score gate: accessibility, best practices and SEO at full marks on every
 * prose route the site publishes, and performance at a floor on the marketing
 * routes.
 *
 * The split is between deterministic audits and a measurement. Three of the
 * four categories audit the page and return the same number anywhere, so they
 * are asserted exactly. Performance is timed, and the same unchanged route
 * measures 100 on one machine and 99 on another, so it is asserted as a floor —
 * see PERFORMANCE_FLOOR for the evidence and for why the floor is 99 rather
 * than something more forgiving.
 *
 * This is a design constraint rather than an optimisation pass. The site argues
 * the viewer is accessible and loads fast, so the site is the first evidence for
 * both claims, and a page falling short refutes its own copy. An aspiration with
 * no gate becomes 94 by the third page.
 *
 * Measured against the built tree, which is the whole published site: the SEO
 * category reads the `robots.txt` and `sitemap.xml` at the tree's root, and the
 * search bundle the rail's field fetches is written after the bundler finishes.
 * `tests/helpers/origin.ts` serves it; `scripts/serve-published.mjs` is the host.
 *
 * Every prose route is under the three deterministic targets — the eight
 * marketing routes and every documentation page. The site argues the viewer is
 * accessible, so a documentation page falling short refutes its own copy exactly
 * as a marketing page does, and the two were only ever separately gated because
 * they were separately built.
 *
 * The performance floor stays on the marketing routes alone. It is asserted at a
 * specific number against recorded evidence for those specific pages, and
 * re-deriving that evidence across the documentation is not the same piece of
 * work as holding it.
 *
 * The playground and the bare viewer are outside the gate entirely. A
 * performance score on a canvas application measures the manifest it was handed,
 * and the deterministic categories on an application shell measure little more.
 *
 * The audited list is derived from `ROUTES` and `DOC_ROUTES` rather than written
 * out here, so a documentation page written tomorrow is audited without anyone
 * remembering this file exists.
 */

import { chromium, expect, test } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

import {
    DOC_ROUTES,
    ROUTES,
    isNavigable,
    type SiteRoute,
} from '../src/lib/routes';
import { CDP_PORT_BASE, PUBLISHED_ORIGIN } from './helpers/origin';

/*
 * One worker, tests in order. The suite is `fullyParallel`, which is right for
 * screens that only read the DOM but wrong here: two Lighthouse audits on one
 * machine contend for CPU and measure each other, which showed up as first
 * contentful paint drifting ~50-100 ms between a parallel and a serial run. A
 * gate that reports a different number depending on machine load is not a gate.
 *
 * `default` rather than `serial` deliberately — `serial` skips the rest of the
 * file after a failure, and one short route must not hide the other seven.
 */
test.describe.configure({ mode: 'default' });

/**
 * The three categories that audit the page rather than time it, and are
 * therefore held on every prose route.
 */
const DETERMINISTIC = ['accessibility', 'best-practices', 'seo'] as const;

/** Those three plus the measurement, which only the marketing routes carry. */
const CATEGORIES = ['performance', ...DETERMINISTIC] as const;

type Category = (typeof CATEGORIES)[number];

/**
 * Accessibility, best practices and SEO are gated at Lighthouse's full mark,
 * exactly.
 *
 * Those three are deterministic: they audit the markup, the headers and the
 * crawl metadata, and they return the same number on any machine. A route that
 * cannot reach full marks in one of them is a finding about the route, and a
 * threshold below 100 would convert it into silence. Performance is the
 * exception, and only performance — see PERFORMANCE_FLOOR.
 */
const FULL_MARKS = 100;

/**
 * The performance floor every marketing route has to clear.
 *
 * The marketing routes and no others: the figure below is not a general
 * standard but a reading of these eight pages, each with its own recorded
 * evidence. The documentation carries the deterministic three, which need no
 * such evidence because they return the same number anywhere.
 *
 * A floor rather than an exact figure, and only for this category, because
 * performance is a *measurement* and it drifts with the machine: routes that
 * this epic has not touched measure 100 on one runner and 99 on another, with
 * `app.css` reverted to the commit that recorded the 100. An exact assertion on
 * a timing measurement fails for the wrong reason, and a gate that cries wolf
 * gets muted.
 *
 * 99 and not lower: one point is the observed spread between machines, and the
 * standing constraint is that this site is the first evidence for its own claim
 * to load fast. A route that has genuinely lost two points still fails here.
 *
 * One floor for all eight, including the design-system appendix, which used to
 * be granted 98 because its italic captions made both serif faces first-paint
 * dependencies. Ticket 07's `unicode-range` split retired that: the appendix
 * now needs 164 KB of the italic rather than 347 KB, and it measures 100. There
 * is no route left that cannot reach the same bar as the others, so there is no
 * exception to express.
 */
const PERFORMANCE_FLOOR = 99;

/*
 * The desktop preset, and both halves of that choice matter. It fixes the form
 * factor, the screen and the throttling, so a score means the same thing on a
 * laptop as on a CI runner — an unpinned run measures the runner. It is also
 * Lighthouse's own published preset rather than hand-written numbers, so the
 * figure here is reproducible with `lighthouse --preset=desktop` by hand.
 */
const PRESET = desktopConfig;

type Audit = {
    id: string;
    title: string;
    score: number | null;
    displayValue?: string;
};

/**
 * The audits that do not apply to a given route, and are left out of its
 * category score.
 *
 * Exactly one audit is ever exempt, and only where the route is deliberately not
 * crawlable. `is-crawlable` scores 0 on any page carrying `noindex`, and
 * Lighthouse offers no way to pass it on one — but `noindex` here is a spec
 * decision, not a defect: the `/system/` appendix is unindexed so that it cannot
 * compete with a real page for a query.
 *
 * The condition is `isNavigable`, the same predicate the sitemap and the
 * `robots` meta already derive from — deliberately not a second list of paths to
 * hand-maintain. A real route that is accidentally made `noindex` still fails.
 */
function exemptAudits(route: SiteRoute): readonly string[] {
    return isNavigable(route) ? [] : ['is-crawlable'];
}

/**
 * Audit a single URL, returning each category's score and the audits that cost
 * it marks.
 *
 * Lighthouse drives the browser over the DevTools protocol, so it needs a port
 * rather than a Playwright page. The browser is launched and closed per audit:
 * a reused browser carries the previous route's HTTP cache, and a warm cache
 * turns the font bytes on the critical path invisible.
 */
async function audit(
    url: string,
    cdpPort: number,
    exempt: readonly string[],
    categories: readonly Category[],
) {
    const browser = await chromium.launch({
        args: [`--remote-debugging-port=${cdpPort}`],
    });
    try {
        const run = await lighthouse(
            url,
            { port: cdpPort, output: 'json', logLevel: 'error' },
            PRESET,
        );
        if (!run?.lhr)
            throw new Error(`Lighthouse returned no report for ${url}`);

        const { categories: reported, audits } = run.lhr;
        return categories.map((id) => {
            const category = reported[id];
            /*
             * Weighted audits only, and only those Lighthouse actually scored.
             * It mixes scored diagnostics into every category with weight 0 —
             * `cache-insight` reports the static host's cache headers, for
             * instance — and naming those alongside the ones that moved the
             * number sends the reader after a finding that costs nothing. A
             * `null` score means the audit did not apply, which Lighthouse
             * leaves out of its own denominator too.
             */
            const scored = category.auditRefs.filter(
                (ref) =>
                    ref.weight > 0 && (audits[ref.id] as Audit).score !== null,
            );
            const counted = scored.filter((ref) => !exempt.includes(ref.id));

            /*
             * Lighthouse's own figure whenever nothing was exempt, so the number
             * this gate reports is the number the report shows. Only a route
             * with an exemption gets a recomputed score, and the arithmetic is
             * Lighthouse's: the weighted mean of its scored audits.
             */
            const score =
                counted.length === scored.length
                    ? (category.score ?? 0)
                    : counted.reduce(
                          (sum, ref) =>
                              sum +
                              ref.weight * (audits[ref.id] as Audit).score!,
                          0,
                      ) / counted.reduce((sum, ref) => sum + ref.weight, 0);

            const failing = counted
                .map((ref) => audits[ref.id] as Audit)
                .filter((entry) => entry.score! < 1)
                .map(
                    (entry) =>
                        `${entry.id}${entry.displayValue ? ` (${entry.displayValue})` : ''}`,
                );
            return { id, score, failing };
        });
    } finally {
        await browser.close();
    }
}

/** One route under the gate, and which categories it answers for. */
type AuditedRoute = {
    readonly path: string;
    readonly categories: readonly Category[];
    readonly exempt: readonly string[];
    /** What the route is held to, said in the test's own name. */
    readonly held: string;
};

/*
 * The gate's subjects, in the order the site declares them: the marketing
 * routes with the measurement, then the documentation with the deterministic
 * three. Derived, so neither list is maintained twice.
 */
const AUDITED: readonly AuditedRoute[] = [
    ...ROUTES.map((route) => ({
        path: route.path,
        categories: CATEGORIES,
        exempt: exemptAudits(route),
        held: 'scores full marks and clears the performance floor',
    })),
    ...DOC_ROUTES.map((route) => ({
        path: route.path,
        categories: DETERMINISTIC,
        /*
         * Nothing to exempt: every documentation page is offered to a crawler,
         * so `is-crawlable` is a real assertion here rather than a decision
         * already taken.
         */
        exempt: [] as readonly string[],
        held: 'scores full marks on accessibility, best practices and SEO',
    })),
];

for (const route of AUDITED) {
    /*
     * No fixtures, deliberately: Lighthouse launches and drives its own
     * browser, so requesting `page` would open a second, idle one per test. The
     * worker index comes from `test.info()` for the same reason — taking it as a
     * parameter would mean declaring an empty fixture pattern.
     */
    test(`${route.path} ${route.held}`, async () => {
        const results = await audit(
            `${PUBLISHED_ORIGIN}${route.path}`,
            CDP_PORT_BASE + test.info().workerIndex,
            route.exempt,
            route.categories,
        );

        for (const { id, score, failing } of results) {
            // Soft, so one audit report names every category the route lost
            // rather than only the first. A page short on two counts is one
            // trip round the loop, not two.
            const measured = expect.soft(
                Math.round(score * 100),
                `${route.path} — ${id}: ${failing.length ? failing.join(', ') : 'no failing audit'}`,
            );
            if (id === 'performance') {
                measured.toBeGreaterThanOrEqual(PERFORMANCE_FLOOR);
            } else {
                measured.toBe(FULL_MARKS);
            }
        }
    });
}
