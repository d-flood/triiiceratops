---
'triiiceratops': patch
---

Security fix: rebuild IIIF rich text from an allowlist instead of filtering it,
and drop DOMPurify.

Manifest summaries, metadata values, required statements, attribution, canvas
metadata and `text/html` annotation bodies are publisher-supplied. They were
filtered by DOMPurify running its **broad default policy** — not IIIF's much
narrower list — and the filtered string was then handed back to `{@html}`.

They now go through one seam, `renderIiifRichText`, which parses the markup
inertly and constructs a `DocumentFragment` out of fresh nodes from IIIF's
allowlist: `a` (`href`, `title`), `img` (`src`, `alt`), and `b`, `br`, `i`, `p`,
`small`, `span`, `sub`, `sup` with no attributes. The component inserts that
fragment with `replaceChildren`, so no untrusted string ever reaches an HTML
sink. `href` and `src` are scheme-checked — `http:`, `https:`, `mailto:` and
scheme-relative URLs are kept, everything else is dropped — and the same check
now guards the `href` of a `linking` annotation body, which was previously bound
straight from the manifest with no check at all.

What you may notice:

- An element outside the allowlist is dropped but its **text is kept**, so
  unknown markup reads as text rather than disappearing. `ul`/`ol`/`li` and
  `table` markup in a manifest will lose its structure.
- **No `style` attribute is emitted**, and none is read from the input. The
  rich-text stylesheet already declared every property the old inline pass
  injected, so appearance is unchanged for permitted markup — but a manifest
  that styled its own rich text inline no longer can.
- Rich text renders synchronously now; there is no longer an asynchronous
  sanitizer load between the manifest arriving and the text appearing.

Core's runtime `dependencies` is now **empty**, which removes ~29.5 KB raw from
the self-contained custom element and leaves a supply-chain review with nothing
to audit beyond triiiceratops itself.
