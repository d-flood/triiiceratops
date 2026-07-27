// Prerender the whole app so `vite build` performs the SSR render at build
// time (SSR-safety gate), producing static server-rendered HTML that the
// browser then hydrates.
export const prerender = true;
export const ssr = true;
