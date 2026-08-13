---
'triiiceratops': patch
---

Classify painting bodies, so audiovisual canvases degrade honestly instead of breaking.

A canvas painted by a `Video` or `Sound` body used to have its media URL handed to the image pipeline — fetched with `new Image()`, rendered as a broken-image error tile, and recorded in the negative cache; an audio canvas with `duration` and no `width`/`height` vanished from layout altogether, so navigation and the thumbnail strip disagreed with the manifest.

Canvas→source resolution now classifies each painting body. A body is an image if its type is `Image`/`dctypes:Image`, its `format` is an image media type, or it carries an Image API service (a body that declares none of the three is still treated as an image, as before). Non-image bodies never reach the source descriptors, the image-service heuristic, the static-image loader, the negative cache, or the thumbnail fallback — **no media URL is requested by any channel**.

A canvas whose painting bodies are all non-image gets the **unsupported presentation**: it keeps its layout rect, its place in navigation and its place in the thumbnail strip, and the renderer paints a localized "content the viewer cannot display" treatment over it. It is not an error — no retry, no negative-cache entry, no error-channel event — and the thumbnail strip shows an audiovisual glyph in place of the missing picture. A canvas carrying image *and* non-image bodies paints its images and ignores the rest silently.

Fixed on the way: a painting annotation whose `body` is an **array** containing a `Choice` never resolved that Choice, because the Choice test ran before the array was unwrapped. The order is now array first, which is what lets the alternatives be classified at all.

New message keys: `canvas_unsupported`.
