---
'@triiiceratops/plugin-sdk': major
---

Plugin SDK 1.0. The compatibility surface narrows to what it can answer honestly,
and the stub factories move off the runtime entry.

- `satisfies` accepts only exact, caret and `>=` ranges and throws on the rest.
  A range it cannot evaluate is a plugin author's mistake, not a compatibility
  answer.
- `PluginCompatibilityReason` and `collectIncompatibilities` are removed.
- `PluginHost` requires all five services.
- The `createStub*` factories move to `@triiiceratops/plugin-sdk/testing`, so a
  production bundle does not carry them.
- New `@triiiceratops/plugin-sdk/register-shared` subpath.

Plugin API 1.0.0 → 1.6.0 across five declared capabilities, matching core's
first-party renderer surface: the `osd@5` capability is gone, and the image
surface a plugin reaches for is core's own API on `ViewerState`.
