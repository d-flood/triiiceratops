/**
 * Trusted Types integration.
 *
 * Under a `require-trusted-types-for 'script'` policy the browser rejects a plain
 * string assigned to a DOM HTML sink (`innerHTML`, `<template>.innerHTML`,
 * `outerHTML`, …). Svelte 5 renders every component by assigning its compiled
 * template markup to `<template>.innerHTML` (`create_fragment_from_html`), and
 * the viewer/plugins render trusted, build-time markup through `{@html}`.
 * Neither path can pass a `TrustedHTML` object, so the only way the viewer can
 * render under Trusted Types is a **default** policy that certifies these
 * strings.
 *
 * This is a pass-through default policy by design: every string it attests is
 * the viewer's own build-time markup (the generated icon SVG, the plugin icon
 * descriptor's inner SVG, the shadow-root stylesheet) or Svelte's own compiled
 * templates. The policy therefore attests already-trusted markup rather than
 * re-sanitizing — which would corrupt the viewer's own `<style>`/SVG output.
 *
 * Untrusted HTML no longer passes through here at all. `utils/sanitizeHtml`'s
 * `renderIiifRichText` builds a `DocumentFragment` out of fresh nodes and
 * `SanitizedHtml.svelte` inserts it with `replaceChildren`, so IIIF rich text
 * reaches no HTML sink and needs no certification.
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

interface TrustedTypePolicyOptions {
    createHTML?: (input: string) => string;
    createScript?: (input: string) => string;
    createScriptURL?: (input: string) => string;
}

interface TrustedTypePolicyFactory {
    defaultPolicy: unknown;
    createPolicy: (name: string, rules: TrustedTypePolicyOptions) => unknown;
}

let installed = false;

/**
 * Install the viewer's pass-through Trusted Types **default** policy so Svelte
 * rendering and the viewer's own `{@html}` output work under
 * `require-trusted-types-for 'script'`. Idempotent and safe to call eagerly on
 * every viewer/element module load; a no-op everywhere Trusted Types is absent.
 */
export function installTrustedTypesPolicy(): void {
    if (installed) return;
    if (typeof window === 'undefined') return;

    const tt = (
        window as unknown as { trustedTypes?: TrustedTypePolicyFactory }
    ).trustedTypes;
    if (!tt) return;

    installed = true;

    // A host that already installed a default policy owns HTML certification;
    // do not attempt to replace it (createPolicy('default') would throw anyway).
    if (tt.defaultPolicy) return;

    try {
        tt.createPolicy('default', {
            // Pass-through: certify already-trusted / already-sanitized markup.
            createHTML: (input: string) => input,
            createScriptURL: (input: string) => input,
        });
    } catch {
        // The host's `trusted-types` directive does not permit a `default`
        // policy from this document; the host must provide its own. Swallow so
        // the absence of a permitted default policy is never a hard crash here.
    }
}
