---
'triiiceratops': minor
'@triiiceratops/plugin-sdk': minor
---

Add a core-owned-chrome activation path for SDK plugins beside the existing self-render path (expand step of an expand→contract migration). When a plugin sets the transitional `__coreChrome` marker, core renders its toolbar button from `meta.icon`/`target`, places the anchored flyout / docked panel container, and hands `view.mount` a content-only element — reusing the one existing plugin button + flyout/panel rendering path (each entry now carries either a Svelte component or a DOM-mount thunk). Core owns open/close, anchoring, and dismiss; `SdkPluginMeta.dismiss` (`'light' | 'explicit'`, default `'light'`, also accepted by `definePlugin`) declares whether an outside pointer-down closes a flyout. A failed activation degrades silently (ADR 0010): logged, emitted on the `pluginerror` channel (DOM event + host callback), and no toolbar button — the user-facing SDK plugin error UI (`SdkPluginError`) and its error rail are removed. The four first-party plugins remain on the untouched legacy path in this change.
