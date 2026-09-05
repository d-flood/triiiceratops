# Plugin activation failures degrade silently; observability is via the channel, not UI

When an SDK plugin's activation or mount fails, core logs it through the debug-gated
developer logger and emits the structured `pluginerror` channel (DOM event + host
callback), but surfaces nothing to the end-user: the plugin's toolbar button is never
rendered and the plugin is simply absent (fail closed). Retry stays available only to
the host, through the channel's `retry()`. The reasoning is that an end-user cannot act
on a plugin failure — compatibility and capability failures are unfixable by them, and
transient mount failures are a developer's concern — so a badged button and a
user-facing "retry" they don't understand is noise, whereas absence is legible. This
also aligns plugin failures with the "quiet plugins, route through channels" direction
and resolves its tension with the original user-facing error state.

The rejected alternative is the plugin-local user-facing error UI (a badged toolbar
button opening a retry card, rendered in a floating rail) that shipped earlier: it
burdens the user with failures they cannot remedy and contradicts quiet-by-default, so
it is removed here in favor of the channel. Failure isolation is unchanged and if
anything strengthened — one plugin's failure never affects the viewer or any other
plugin, and nothing half-rendered is left behind. A global viewer error UI and any
automatic retry/backoff remain rejected: the first over-escalates a contained failure,
the second masks real failures without host or user consent.
