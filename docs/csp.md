---
icon: lucide/shield-check
---

# Content Security Policy

Triiiceratops runs under a strict Content Security Policy. It does **not** require
`unsafe-eval`, and it does not require `unsafe-inline` for scripts. Runtime styles
prefer constructable stylesheets (`adoptedStyleSheets`), which need no inline
`<style>` and are CSP-friendly by default; where constructable stylesheets are
unavailable the style service falls back to a `<style>` element that carries your
CSP **nonce**.

## Recommended policy

A realistic strict policy for a page hosting the viewer and plugins:

```
Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'nonce-<RANDOM>';
    img-src 'self' data: https:;
    connect-src 'self' https:;
    object-src 'none';
    base-uri 'self'
```

Notes:

- `script-src 'self'` — no `unsafe-eval`, no `unsafe-inline`. Serve the viewer and
  plugin scripts from your own origin (or add the CDN origin you load them from).
- `style-src 'self' 'nonce-<RANDOM>'` — the `nonce` lets the style service's
  `<style>` fallback path apply plugin/global styles when constructable
  stylesheets are not available. Generate a fresh random nonce per response.
- `img-src` includes `data:` for canvas/thumbnail data URIs and `https:` for
  remote IIIF image tiles; tighten to the specific IIIF hosts you use.
- `connect-src` must allow the IIIF hosts your manifests and image services live
  on.

## Advertising the style nonce

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
SDK goes through a policy or safe APIs. If you enforce Trusted Types, include it
alongside the policy above:

```
Content-Security-Policy: require-trusted-types-for 'script'
```

## Verified against the packed packages

CI runs CSP packed-consumer fixtures under a realistic strict policy (no
`unsafe-eval`, no script `unsafe-inline`) across Chromium, Firefox, and WebKit: a
light-DOM Svelte consumer and a Web Component IIFE page render and theme
correctly, a plugin installs styles via the nonce fallback path, and the page
records zero `securitypolicyviolation` events. A Trusted Types page is verified on
Chromium.
