---
'triiiceratops': patch
---

Security fix: render search excerpts as text.

`SearchHit.before`, `match` and `after` reached four raw `{@html}` sinks with
nothing but a `&lt;mark&gt;` un-escaper in the way. Those fields are public API —
any host-supplied `SearchProvider`, and any remote IIIF Content Search service,
fills them — so a hostile or compromised search service could execute script in
the host page. They are now documented plain text and rendered as text nodes.

Highlighting still works the documented way: wrap the matched term in
`<mark>…</mark>`, literally or entity-encoded as `&lt;mark&gt;…&lt;/mark&gt;`,
and the panel renders a real `<mark>` element around it. Only the **bare,
lowercase** tag is a delimiter, though — `<mark class="hit">` and `<MARK>` used
to reach the sink as markup and now render as visible characters.

Because a service that escapes its excerpt escapes the surrounding text too, the
five basic entities (`&amp;` `&lt;` `&gt;` `&quot;` `&#39;`) are decoded in each
run before it becomes a text node, so `AT&amp;T` still reads as `AT&T`. Exactly
one level comes off: `&amp;lt;mark&amp;gt;` is shown literally and highlights
nothing.

Behaviour change: a provider that returned any **other** markup will now see it
rendered as visible characters rather than interpreted. That is deliberate.
