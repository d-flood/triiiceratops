---
icon: lucide/shield-check
---

# Content Security Policy

Triiiceratops runs under a strict Content Security Policy. It does **not** require
`unsafe-eval`, and it does not require `unsafe-inline` for scripts. Runtime styles
(the plugin/global style service) prefer constructable stylesheets
(`adoptedStyleSheets`), which need no inline `<style>` and are CSP-friendly by
default. The service falls back to a `<style>` element — carrying your CSP
**nonce** — whenever constructable stylesheets are unavailable, *or* whenever the
host advertises a nonce at all (nonces cannot attach to constructable
stylesheets, so advertising one always opts back into the `<style>` path).

The viewer itself also uses inline `style="…"` attributes for dynamic layout
(panel widths, positioning, and similar). A nonce does not cover style
*attributes* — only `'unsafe-inline'` does — so every policy below allows those
explicitly via `style-src-attr`.

The two distributions need slightly different policies, because only the
light-DOM Svelte package's component styles are nonce-addressable.

## Recommended policy

### Svelte package (light DOM)

Component styles are extracted to a same-origin stylesheet at build time, so
`<style>` **elements** can be locked to `'self'` plus a nonce:

```
Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'nonce-<RANDOM>';
    style-src-attr 'unsafe-inline';
    img-src 'self' data: blob: https:;
    connect-src 'self' https:;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self'
```

### Web Component (custom element)

The custom element injects each Svelte component's scoped CSS into its shadow
root as a `<style>` element at runtime — there is no per-element style nonce
hook in Svelte for this path — so the shadow root needs `'unsafe-inline'` in
`style-src` itself, not just a nonce:

```
Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    style-src-attr 'unsafe-inline';
    img-src 'self' data: blob: https:;
    connect-src 'self' https:;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self'
```

Notes (both distributions):

- `script-src 'self'` — no `unsafe-eval`, no `unsafe-inline`. Serve the viewer and
  plugin scripts from your own origin (or add the CDN origin you load them from).
- `style-src-attr 'unsafe-inline'` — covers the viewer's inline layout style
  attributes. These cannot execute script under the strict `script-src` above,
  so allowing them is the recommended posture rather than a risk trade-off.
- `img-src` includes `data:` for canvas/thumbnail data URIs, `blob:` for
  generated image exports, and `https:` for remote IIIF image tiles; tighten
  to the specific IIIF hosts you use.
- `worker-src 'self' blob:` — some plugins (e.g. the annotation editor) run
  work off the main thread via a blob-URL `Worker`.
- `connect-src` must allow the IIIF hosts your manifests and image services live
  on.

## Advertising the style nonce

Relevant to the Svelte-package (light DOM) recipe above — the Web Component
recipe already allows `'unsafe-inline'` in `style-src` for its shadow-root
styles, so it has no nonce to advertise.

The style service discovers a nonce automatically. Advertise yours with a meta
tag (substitute the same random value used in the CSP header), or on any nonced
`<style>` / `<script>` / `<link>` element already on the page:

```html
<meta property="csp-nonce" content="<RANDOM>" />
```

The service reads the `.nonce` IDL property in preference to the `nonce`
attribute, matching how browsers hide the attribute after parsing. When the host
supplies no nonce and constructable stylesheets are available, no inline style is
emitted at all.

## Trusted Types

The viewer and plugins operate under a Trusted Types policy
(`require-trusted-types-for 'script'`) in Chromium: DOM-sink usage in core and the
SDK goes through a policy or safe APIs. Core installs a pass-through **`default`**
Trusted Types policy (untrusted HTML is sanitized upstream before it reaches any
DOM sink) — if your app already installs its own `default` policy, core defers to
it. If you enforce Trusted Types, include it alongside the policy above:

```
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types default;
```

## Verified against the packed packages

CI runs CSP packed-consumer fixtures under a realistic strict policy (no
`unsafe-eval`, no script `unsafe-inline`) across Chromium, Firefox, and WebKit: a
light-DOM Svelte consumer and a Web Component IIFE page render and theme
correctly, a plugin installs styles via the nonce fallback path, and the page
records zero `securitypolicyviolation` events. A Trusted Types page is verified on
Chromium.
