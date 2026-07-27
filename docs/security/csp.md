---
search:
  exclude: true
---

# Content Security Policy (CSP) recipe

> **Internal note.** This is the supported-CSP recipe reference introduced with
> the CSP test matrix (ticket 24). Its per-distribution recipes and Trusted
> Types walkthrough have since been folded into the public
> [Content Security Policy](../csp.md) guide (ticket 26). Kept here, excluded
> from the public nav and search, as the terse working reference this file was
> checked against while writing that page. What is below is verified end-to-end
> by the packed-consumer CSP fixtures (`test-consumers/fixtures/csp-*`).

Triiiceratops runs under a strict Content Security Policy. The security-critical
control is **`script-src`**: the viewer needs **no `unsafe-eval`** and **no
`unsafe-inline` for scripts**.

## Supported recipe

### Light-DOM Svelte package

Component styles are extracted to a same-origin stylesheet at build time, so
style **elements** can be locked to `'self'` plus a nonce:

```
default-src 'self';
script-src 'self';
style-src 'self' 'nonce-<RANDOM>';
style-src-attr 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
```

### Web Component (custom element)

The custom element injects each Svelte component's scoped CSS into its shadow
root as a `<style>` element at runtime (there is no per-element style nonce hook
in Svelte), so the shadow root requires inline styles:

```
default-src 'self';
script-src 'self' 'nonce-<RANDOM>';   # nonce only if you have inline <script>
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
```

### Notes

- **`style-src-attr 'unsafe-inline'`** — the viewer uses inline `style="…"`
  attributes for dynamic layout. Inline style attributes cannot carry a nonce
  and cannot execute script under the strict `script-src`, so allowing them is
  the recommended posture.
- **Style nonce.** To have the plugin style service emit **nonce-aware
  `<style>` elements** (instead of constructable stylesheets, which are not
  governed by `style-src` at all), advertise your per-response nonce with a meta
  element and use it in your `style-src`:

  ```html
  <meta property="csp-nonce" content="<RANDOM>" />
  ```

  The value must be a fresh random string per response.
- **Trusted Types.** To run under `require-trusted-types-for 'script'`, allow the
  viewer's default policy name. Core installs a pass-through **`default`** Trusted
  Types policy (untrusted HTML is sanitized upstream before it reaches any DOM
  sink), so add:

  ```
  require-trusted-types-for 'script';
  trusted-types default;
  ```

  If your app already installs its own `default` policy, core defers to it.
