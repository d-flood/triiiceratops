/**
 * The origin this app's smoke screens are served from, shared by
 * `playwright.config.ts` and by the specs, which need an ABSOLUTE URL: a bare
 * IIIF URI handed to the viewer as a content state cannot be page-relative.
 *
 * `VIEWER_E2E_PORT` exists so concurrent runs can each take their own port, and
 * the default differs from every other package's to keep an unconfigured run
 * out of their way. A port that is nevertheless taken fails the run: the dev
 * server is started with `strictPort` and never reused.
 *
 * IPv4 loopback, never `localhost`: some browsers resolve `localhost` to IPv6
 * `::1` while Vite's dev server binds IPv4 only.
 */
export const PORT = process.env.VIEWER_E2E_PORT ?? '5177';

export const ORIGIN = `http://127.0.0.1:${PORT}`;
