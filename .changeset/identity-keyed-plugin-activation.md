---
'triiiceratops': patch
---

key plugin activation lifetime to plugin identity instead of to the plugins array.

Both plugin lifecycle effects in the viewer previously tore down and rebuilt _every_ plugin whenever the `plugins` array changed identity, so any host that re-evaluated its plugin list per render restarted all of them — losing plugin UI state, dropping subscriptions, releasing and re-installing styles, and re-registering toolbar chrome. The legacy `PluginDef` effect and the SDK activation effect now diff the incoming list against live registrations and activations by plugin **object reference**: a plugin present before and after is left completely untouched, one that is absent goes through the existing teardown path, and a newly present one goes through the existing activation path. Reordering a list whose membership is unchanged causes no activation churn at all. Anonymous legacy plugins (no `id`) keep the id core assigned them across effect runs, which is why identity has to key on the object rather than on the derived id.

Nothing else about activation changes: compatibility negotiation, the `pluginerror` channels, chrome registration, ordering guarantees, and ADR 0010's fail-closed behavior are all as before, the `retry()` on a `PluginError` still performs its deliberate full re-activation of the single plugin instance it names, and unmounting the viewer still deactivates everything.
