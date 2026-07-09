# Content state is an explicit component input; URL reading is opt-in

The viewer accepts a [content state](../../CONTEXT.md) as an explicit `content-state`
attribute/prop on the shipped Svelte and web components. Reading the IIIF-mandated
`iiif-content` parameter from `window.location` is **opt-in** via a
`read-content-state-from-url` flag that defaults **off**, rather than being read
automatically the way monolithic viewers (Mirador, Universal Viewer) do. Triiiceratops
ships as a component "dropped into any HTML page," so silently reaching into the host's
address bar could hijack host routing or consume an `iiif-content` param meant for a
different consumer; the host must consciously delegate URL ownership to the viewer.

## Consequences

- When multiple view sources are present they resolve by precedence **discrete props
  (`manifest-id`/`manifest-json` + `canvas-id` + `initial-canvas-region`) > `content-state`
  prop > `iiif-content` URL param**. Discrete props are the manual-driving API and win;
  the URL is ambient and lowest-trust. This preserves the demo's prior "apply
  `iiif-content` only when no manifest is set" behavior.
- The URL param is read once on mount and the host address bar is never mutated (no
  `history.replaceState`); URL cleanup and SPA re-navigation are the consumer's concern.
- Ingestion never throws: unparseable or partially-unsupported content states (temporal
  `#t=`, multi-target arrays, Collection targets) degrade to the most the viewer can
  honor and emit a dev-mode warning, returning nothing only when no manifest is
  resolvable.
