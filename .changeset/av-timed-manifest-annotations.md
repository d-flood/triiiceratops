---
'triiiceratops': minor
'@triiiceratops/plugin-av': minor
---

The AV plugin lists a claimed canvas's timed manifest annotations. A manifest whose author wrote commentary against moments in a recording — Cookbook recipe `0103-poetry-reading-annotations` is the canonical example — now shows that commentary in the panel the plugin already owns, as a Notes section beside the transcript: each note's time span and its text, in time order, the notes covering the playhead marked as the recording moves, and a click on any note seeking to its start without starting playback. Overlapping notes are all marked, because editorial commentary legitimately overlaps in a way caption cues do not. A note whose target names a start but no end is listed and seekable, but never marked — there is no span to be inside.

The panel is reachable on a canvas that carries notes and no captions, and the transport's control names what it will open, so a button labelled "Transcript" never opens a panel holding only notes. A canvas offering neither leaves the control out entirely and never fetches the panel's chunk.

The fence is narrow on purpose: a note is listed only when its target parses to a temporal media fragment and its body is a `TextualBody` whose `format` is absent or `text/plain`. HTML bodies, external resources and image bodies are skipped rather than guessed at, since rendering them would mean either shipping a sanitizer into the panel or writing manifest strings into the page as markup. Whole-canvas comments have no row in a time-ordered list and are not listed.

The cost is a scanner, a predicate and two catalog strings on the eager side; the list itself grows the panel's existing lazy chunk rather than adding a second one, because the rows, the playhead marking, the timestamp formatting, the click-to-seek and the keyboard handling are the transcript's, shared.

Core exports `parseIiifTime` publicly and shares it on the `window.Triiiceratops.core` namespace, so a first-party claimant reads media-fragment times through core's parser instead of carrying a second copy that could disagree with it about whether `?t=157` is a fragment. The function was already compiled into the element bundle for `start`, structures and content state, so the export costs essentially nothing.
