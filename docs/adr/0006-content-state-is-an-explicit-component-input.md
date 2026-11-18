# Content state is an explicit component input; URL access is opt-in

The viewer takes a content state as an explicit input, and reads or writes the host page's URL only when the host opts in.

- The viewer is dropped into pages it does not own; touching the URL unasked could hijack host routing or consume a parameter meant for someone else.
- Discrete inputs outrank the `content-state` input, which outranks the URL.
- When writing is on, a URL content state naming the same manifest wins for canvas and region, so a reload restores the reader's view; the host still decides which manifest opens.
- Opt-in writing gives script-tag and CMS hosts a shareable URL without glue code.
- Rejected: reading `iiif-content` automatically, as monolithic viewers do, because the host must consciously delegate its URL.
- Rejected: a written URL winning outright, because a pasted link could open a foreign manifest on an item page.
- Rejected: one rule for custom parameter names and another for `iiif-content`, because a single rule is easier to explain.
