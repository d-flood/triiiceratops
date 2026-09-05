/**
 * Every route prerenders. The static adapter runs with `strict`, so a route that
 * escaped this would fail the build rather than emit a client-rendered shell.
 */
export const prerender = true;

/**
 * Directory-style URLs, so a page prerenders to `<route>/index.html`.
 *
 * The published site's other paths are directories — `/demo/`, `/viewer/`,
 * `/docs/1.0/` — and the URL contract promises these routes the same way. Flat
 * `size.html` files would also put a bare `.html` name at the top level of the
 * root for every route.
 */
export const trailingSlash = 'always';
