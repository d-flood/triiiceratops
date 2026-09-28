/* IPv4 loopback, never `localhost`: some browsers resolve it to IPv6 while Vite binds IPv4 only. */
export const PORT = process.env.SITE_E2E_PORT ?? '5179';

export const ORIGIN = `http://127.0.0.1:${PORT}`;

export const PUBLISHED_PORT = process.env.SITE_PUBLISHED_PORT ?? '5180';

export const PUBLISHED_ORIGIN = `http://127.0.0.1:${PUBLISHED_PORT}`;

export const CDP_PORT_BASE = Number(PUBLISHED_PORT) + 100;
