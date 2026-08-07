/**
 * Trusted Types integration (ticket 24).
 *
 * Under a `require-trusted-types-for 'script'` policy the browser rejects a plain
 * string assigned to a DOM HTML sink (`innerHTML`, `<template>.innerHTML`,
 * `outerHTML`, …). Svelte 5 renders every component by assigning its compiled
 * template markup to `<template>.innerHTML` (`create_fragment_from_html`), and
 * the viewer/plugins render trusted, build-time or already-sanitized markup
 * through `{@html}`. Neither path can pass a `TrustedHTML` object, so the only
 * way the viewer can render under Trusted Types is a **default** policy that
 * certifies these strings.
 *
 * This is a pass-through default policy by design: triiiceratops sanitizes
 * untrusted HTML upstream (see `utils/sanitizeHtml` + `SanitizedHtml.svelte`)
 * before it ever reaches a sink, and everything else fed to `{@html}` is the
 * viewer's own build-time markup (icons, the shadow-root stylesheet). The policy
 * therefore attests already-trusted markup rather than re-sanitizing — which
 * would corrupt the viewer's own `<style>`/SVG output.
 *
 * Good-citizen guards:
 * - No-op when Trusted Types is unavailable (all non-Chromium engines today, and
 *   SSR) — the sinks are plain string assignments there.
 * - Never clobbers a host's existing default policy (`trustedTypes.defaultPolicy`).
 * - Best-effort: if the host's `trusted-types` CSP directive does not allow the
 *   `default` policy name, `createPolicy` throws and we swallow it — the host is
 *   then responsible for supplying its own default policy (documented in the CSP
 *   recipe).
 */
/**
 * Install the viewer's pass-through Trusted Types **default** policy so Svelte
 * rendering and the viewer's own `{@html}` output work under
 * `require-trusted-types-for 'script'`. Idempotent and safe to call eagerly on
 * every viewer/element module load; a no-op everywhere Trusted Types is absent.
 */
export declare function installTrustedTypesPolicy(): void;
