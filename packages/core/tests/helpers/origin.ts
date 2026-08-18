/**
 * The origin the e2e dev server is served from, shared by `playwright.config.ts`
 * and by the specs that need an ABSOLUTE URL rather than a page-relative one —
 * an image service id that goes into a manifest body cannot be relative.
 *
 * `E2E_PORT` exists so concurrent runs can each take their own port. Without it
 * the origin is baked into both the config and those specs, and two runs on one
 * machine either collide on the port or silently talk to each other's server.
 *
 * IPv4 loopback, never `localhost`: Firefox and WebKit resolve `localhost` to
 * IPv6 `::1` while Vite's dev server binds IPv4 only.
 */
export const E2E_PORT = process.env.E2E_PORT ?? '5175';

export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
