# @triiiceratops/plugin-sdk

## 1.0.0-rc.3

### Patch Changes

- d280560: Cut a fresh rc so the `latest` dist-tag moves off the broken `1.0.0-rc.1` (which
  shipped `triiiceratops: workspace:^` and crashes bare `npm install` with
  `EUNSUPPORTEDPROTOCOL`). The corrected `rc.2` is already published, but under npm
  OIDC trusted publishing a dist-tag can only be set at publish time — there is no
  post-publish `npm dist-tag` — so pointing `latest` at a clean version requires
  publishing a new version to `latest`. No source changed.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.2

### Patch Changes

- 8c58f9c: Republish to supersede `1.0.0-rc.1`, whose published tarball carried a
  `workspace:^` peer-dependency protocol on `triiiceratops` (a leftover from
  monorepo linking that was never rewritten to a real semver range). npm cannot
  parse `workspace:` and crashed consumer installs with `EUNSUPPORTEDPROTOCOL`.

    The release pipeline now rewrites `workspace:` ranges to real semver before
    packing and hard-fails the pack if any residual `workspace:` protocol survives
    in a packed tarball, so this cannot regress. No SDK source changed — this
    changeset only cuts a new version through the corrected pipeline.
    - triiiceratops@1.0.0-rc.26

## 1.0.0-rc.1

### Minor Changes

- 064bf1f: Add a core-owned-chrome activation path for SDK plugins, then complete the migration onto it as the only path: the legacy self-render path and the transitional `__coreChrome` marker on `SdkPluginMeta`/`definePlugin` are removed, and `dismiss` (`'light' | 'explicit'`, default `'light'`) declares whether an outside pointer-down closes a flyout.

    Add `definePluginStyles(css, id)` to the entry — a dependency-free helper that shapes a plugin's global stylesheet and its style-service install id into the `{ STYLES, STYLE_ID }` pair `context.styles.install(STYLES, STYLE_ID)` consumes, carrying the shared root-aware-install contract in one place. Also add a `@triiiceratops/plugin-sdk/register` subpath exporting `registerBrowserPlugin`, the self-contained helper that bootstraps the `window.Triiiceratops` namespace and registers a plugin factory into it (order-independent, first-registration-wins, never activates). Both helpers import nothing beyond erased types, so plugin IIFEs still bundle them with no SDK runtime or Svelte pulled in. The four first-party plugins now consume these shared implementations instead of each carrying byte-identical copies; runtime behavior is unchanged.

### Patch Changes

- Updated dependencies [064bf1f]
    - triiiceratops@1.0.0-rc.26
