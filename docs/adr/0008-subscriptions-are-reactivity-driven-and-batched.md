# Viewer-state subscriptions are reactivity-driven and batched, not command-driven

`ViewerState.subscribe` notifications are produced by core reactivity (an effect over
every inventoried member), not by individual mutation methods calling `notify()`. This
makes completeness structural: core-internal Svelte binding writes, command writes, and
even unsupported direct assignment all notify, and core keeps writing idiomatic Svelte
internally. The price is timing — notifications are batched, payload-free, and delivered
on the next flush, so a subscriber sees final post-batch state and never intermediate
transitions; tests `await tick()`. Command-driven synchronous notification was rejected
because any internal write path that forgot to route through a command would silently
skip plugin subscribers — a discipline bug we'd re-buy with every future `bind:`.
Guard rails that keep this performant: member-level granularity (commands replace
members or bump collections, never deep-mutate), per-frame values are query-only or
throttled by explicit inventory decision, and framework-neutral selectors are memoized
by state version with equality gating. Plugin activations and framework wrappers own
isolated selector runtimes over the same subscription contract. Each listener call is
individually guarded, so a throwing plugin listener is isolated and reported as a
`subscription`-phase `pluginerror`; consumer selector failures instead surface through
their framework's native error handling.
