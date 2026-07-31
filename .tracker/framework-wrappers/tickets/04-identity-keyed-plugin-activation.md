## What to build

Make plugin activation lifetime keyed to plugin identity instead of to the identity of the
plugins array. Today both plugin effects tear down and rebuild _every_ plugin whenever the
array identity changes, so any host that re-evaluates its plugin list per render restarts
all plugins — losing plugin UI state, subscriptions, injected styles, and toolbar chrome.
This is a pre-existing defect that the React and Vue render models would make routine.

## Where to start

- Read the legacy effect in `packages/core/src/lib/components/TriiiceratopsViewer.svelte`
  (~lines 451-487): it unregisters every id in `registeredPluginIds`, then re-registers the
  whole list.
- Read the SDK effect in the same file (~lines 774-788): `teardownSdkActivations()` followed
  by `activateSdkPlugin()` for every plugin. `deactivateSdkRecord` runs real teardown —
  view cleanup, dropped subscriptions, released styles, unregistered chrome.
- Read the derived values that make churn inevitable (~lines 217-220): `allPlugins` and the
  two `.filter(...)` deriveds each produce a new array whenever the incoming prop changes
  identity.
- Read the single-plugin replace path used by `retry()` (~line 755) — it is the one place a
  deliberate full replacement is correct, and it must keep working.
- Read the **Activation** entry in `CONTEXT.md`, which now states that activation lifetime is
  keyed to plugin identity within the list, not to the list itself.

## Contract

- Both effects diff the incoming list against live activations **by plugin object reference**.
    - Present before and after → **untouched**. No deactivate, no re-activate, no style
      re-install, no chrome re-registration, no subscription churn, no state loss.
    - Absent now → deactivate through the existing teardown path, unchanged.
    - Newly present → activate through the existing path, unchanged.
    - Order changed with no membership change → **no activation churn**. Chrome ordering, if
      it follows list order, is a separate concern from activation lifetime.
- The legacy path mints a fresh id per registration for anonymous plugins
  (`plugin.id || createPluginId()`), so identity must key on the plugin **object reference**
  with the assigned id retained across effect runs. Keying on the derived id cannot work.
- `retry()` keeps its deliberate full re-activation of one plugin instance.
- Unmounting the viewer still deactivates everything, as today.

## Out of scope

- Do not touch `activateSdkPlugin`, `deactivateSdkRecord`, `registerPlugin`,
  `unregisterPlugin`, compatibility negotiation, the `PluginError` channels, chrome
  registration, or `emitPluginError`.
- Do not change the `SdkActivationRecord` shape beyond what identity-keying requires.
- Do not unify or refactor the legacy and SDK paths while you are in here.
- Do not change plugin activation semantics, ordering guarantees, or failure behavior
  (ADR 0010 fail-closed stays as-is).
- Do not add memoization or equality helpers to the viewer component; the wrapper-side guard
  is ticket 05's concern.

## Acceptance criteria

- [ ] Re-supplying a shallow-equal plugin array leaves every activation untouched: same activation instances, no deactivate/activate calls, subscriptions intact, styles not re-installed, chrome not re-registered.
- [ ] Removing one plugin deactivates only that one; adding one activates only that one; both are covered for the legacy and SDK paths.
- [ ] Reordering a list with unchanged membership causes no activation churn.
- [ ] Anonymous legacy plugins (no `id`) keep their assigned id across effect runs and are not re-registered.
- [ ] `retry()` still performs a full single-plugin re-activation.
- [ ] Existing plugin activation, chrome, failure-isolation, and services tests pass unchanged.

Run:

```sh
pnpm --filter triiiceratops exec vitest run src/lib/plugin
pnpm --filter triiiceratops exec vitest run src/lib/components
pnpm --filter triiiceratops check
pnpm --filter triiiceratops build:lib
```

Success is every command exiting `0`, with a new test proving plugin instances survive an
equal-list re-supply.

## Blocked by

None - can start immediately.
