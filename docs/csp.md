---
icon: lucide/shield-check
description: "Triiiceratops under a strict Content Security Policy: no unsafe-eval, no unsafe-inline for scripts, and what your policy does need to allow."
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

**Which recipe applies to you?**

| Your integration | Recipe |
| :--- | :--- |
| [Svelte](svelte.md) — `triiiceratops/svelte` | [Light DOM](#light-dom-svelte-component) |
| [React](react.md) — `triiiceratops/react` | [Shadow DOM](#shadow-dom-custom-element) |
| [Vue](vue.md) — `triiiceratops/vue` | [Shadow DOM](#shadow-dom-custom-element) |
| [Any framework](integration.md) — the custom element | [Shadow DOM](#shadow-dom-custom-element) |

The React and Vue wrappers host the same `<triiiceratops-viewer>` custom element
every other non-Svelte integration uses, so its shadow root has the same style
requirements — they follow the shadow-DOM recipe, not the Svelte one, and there
is no nonce for them to advertise.

## Recommended policy

### Light DOM (Svelte component)

Component styles are extracted to a same-origin stylesheet at build time, so
`<style>` **elements** can be locked to `'self'` plus a nonce:

```
Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'nonce-<RANDOM>';
    style-src-attr 'unsafe-inline';
    img-src 'self' data: blob: https:;
    media-src 'self' blob: https:;
    connect-src 'self' https:;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self'
```

### Shadow DOM (custom element)

Used by the custom element directly **and** by the React and Vue wrappers.

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
    media-src 'self' blob: https:;
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
- `media-src` governs `<audio>`, `<video>` and `<track>`, so it matters only when
  [the AV plugin](plugin-av.md) is loaded — see [audio and video](#audio-and-video)
  below. Drop the directive entirely if you never play time-based media.
- `worker-src 'self' blob:` — a plugin may run work off the main thread through a
  blob-URL `Worker`; hls.js, behind the AV plugin, is the first-party case.
- `connect-src` must allow the IIIF hosts your manifests and image services live
  on — and, if you pass content states, the hosts those live on too; see
  [content states](#content-states) below.

## Content states

A [content state](content-state.md) delivered as a **bare IIIF URI** is
dereferenced: the viewer fetches the document at that URI before it can know
which manifest to open. The request goes through the same fetch path a
`manifest-id` uses, so it is governed by `connect-src` — and it is easy to miss,
because the URI is often not on the host your manifests come from.

A policy locked down to your own manifest host, like

```
connect-src 'self' https://iiif.example.edu;
```

opens every manifest you publish and refuses a content state someone links to
you from anywhere else. The failure is quiet by design: ingestion never throws,
so the browser blocks the request and the viewer reports it as a `content-state`
scoped [`viewererror`](integration.md#attributes-properties-and-events) with the code
`content-state-dereference-failed`. It then **falls back to loading the URI as a
manifest** — a second request to the same blocked host, which the same policy
refuses, so nothing opens. Allow the hosts you accept content states from, or
accept content states only as JSON on the `content-state` input, which fetches
nothing.

This adds no trust boundary: a content-state URI is exactly as trusted as a
manifest URI, and this policy is the control on both.

## Audio and video

Core is an image viewer and needs no `media-src` at all. The directive is in the
recipes above because [the AV plugin](plugin-av.md) is opt-in and common enough to
plan for; three things about it are worth stating explicitly.

- **`media-src` covers the caption track too.** CSP treats `<track>` as a media
  request, so a policy that allows the video host but not the VTT host loads the
  media and silently offers no captions.
- **`blob:` is required for HLS.** Where a browser has no native HLS the plugin
  falls back to hls.js, which drives the media element through Media Source
  Extensions — the element's `src` becomes a blob URL. Without `blob:` in
  `media-src`, progressive files play and HLS streams do not.
- **The lazy chunks are scripts.** The plugin fetches hls.js, the waveform
  parsers, the segment sequencer and the transcript panel as separate ES modules
  at the moment a manifest needs them, so they are governed by `script-src` and
  must be served from an origin it allows. Under the IIFE distribution that means
  the whole `dist/` directory, not one file out of it.

Media also has to be **CORS-readable** — a requirement of the plugin, not of your
CSP, and the usual reason a file that plays in a plain `<video>` tag will not play
here. See [the AV plugin's page](plugin-av.md#cors) for that side of it.

## Advertising the style nonce

Relevant to the [light-DOM](#light-dom-svelte-component) recipe only — the
[shadow-DOM](#shadow-dom-custom-element) recipe already allows `'unsafe-inline'`
in `style-src` for its shadow-root styles, so it has no nonce to advertise.

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
