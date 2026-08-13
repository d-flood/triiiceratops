---
search:
  exclude: true
---

# Plugin-owned state is published through ViewerState, not exported beside it

A plugin whose UI performs actions (play, seek, mute) must make those actions externally
commandable — the parity rule does not stop at core's own chrome. But putting playback
members in core's state inventory would ship commands core cannot implement (nothing is
behind `play()` in a viewer with no AV plugin), and letting hosts import a control handle
from the plugin package would create the second state surface ADR 0007 rules out. The
resolution: an activation may **publish one state object**, registered during activation
and removed when it ends, which hosts reach only through
`viewerState.getPluginState(pluginId)`. The set of published states is itself a notifying
inventory member, so wrappers observe availability; the concrete interface (`AVState`) and
a typed accessor ship in the plugin package, which any host commanding that plugin already
depends on at build time. ViewerState remains the sole surface — published state hangs off
it, not beside it.

Published state transplants the ViewerState discipline rather than inventing a parallel
one: members are classified command / observable / query-only, notifications are batched
and payload-free, high-frequency values (playback `currentTime`, like viewport position
before it) are query-only with their own cadence rather than notifying members, and the
SDK's conformance kit checks the classification the way core's capability-matrix test
checks the inventory. The selector runtime is **generalized, not duplicated**: its only
dependency on ViewerState was always `subscribe`/a finer-cadence subscribe/synchronous
reads, so loosening the source type lets the one existing implementation serve React, Vue,
and Svelte adapters over published state. A future consistency pass that finds the AV
plugin shipping "its own little store" and proposes moving its members into core's
inventory, or a wrapper convenience that hands out the plugin object directly, is undoing
this decision, not tidying it.

Failure semantics are part of the contract: a command the environment refuses (a browser
autoplay policy rejecting `play()`) resolves into observable state, never a rejection
thrown at the host; a command the plugin cannot honor (playback on a non-AV canvas) is
refused through the plugin error channel's existing `command` phase. Published state is
absent — `getPluginState` returns null — whenever its activation is absent, failed, or
retrying, which is the same fail-closed lifecycle as every other plugin capability.
