/**
 * The origin this app's screens are served from, shared by
 * `playwright.config.ts` and by the specs.
 *
 * `SITE_E2E_PORT` exists so concurrent runs can each take their own port, and
 * the default differs from every other workspace app's to keep an unconfigured
 * run out of their way. A port that is nevertheless taken fails the run: the
 * dev server is started with `strictPort` and never reused.
 *
 * IPv4 loopback, never `localhost`: some browsers resolve `localhost` to IPv6
 * `::1` while Vite's dev server binds IPv4 only.
 */
export const PORT = process.env.SITE_E2E_PORT ?? '5179';

export const ORIGIN = `http://127.0.0.1:${PORT}`;

/**
 * The second origin: the built tree at `apps/site/build`, served statically.
 *
 * One build emits the whole published tree, so this IS the published site. The
 * score gate measures it rather than the development server: the SEO category
 * reads `robots.txt` and `sitemap.xml` at the tree's root, the search bundle and
 * the consumer examples are written after the bundler has finished, and only the
 * finished tree gives real answers about links and crawlability.
 */
export const PUBLISHED_PORT = process.env.SITE_PUBLISHED_PORT ?? '5180';

export const PUBLISHED_ORIGIN = `http://127.0.0.1:${PUBLISHED_PORT}`;

/**
 * Base for the per-worker CDP port the score gate's browser listens on.
 *
 * Lighthouse drives the browser over the DevTools protocol, so each worker needs
 * a port of its own or two concurrent audits would attach to one browser and
 * measure each other's traffic. Derived from the served port so that giving a
 * background run its own `SITE_PUBLISHED_PORT` moves its debugging ports too.
 */
export const CDP_PORT_BASE = Number(PUBLISHED_PORT) + 100;
