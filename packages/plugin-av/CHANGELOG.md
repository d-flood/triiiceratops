# @triiiceratops/plugin-av

## 1.0.2

### Patch Changes

- 8680fee: Thumbnail navigation and `no-nav` ranges in the structures panel (cookbook
  0229), toolbar menu button placement on touch devices, tooltip visibility at
  the far left edge, and a single shared media time parser/formatter
  (`formatMediaTime`) in place of the duplicated implementations.
- Updated dependencies [8680fee]
    - triiiceratops@1.0.1
    - @triiiceratops/plugin-sdk@1.0.0

## 1.0.1

### Patch Changes

- 1df3a76: `svelte` is an optional peer dependency, as it already is on core and the SDK.
    - triiiceratops@1.0.0

## 1.0.0

### Major Changes

- 34742cb: `@triiiceratops/plugin-av` 1.0 — the first-party audiovisual claimant.

    The plugin claims audiovisual canvases through core's `claimCanvas` seam, renders
    their media, and publishes commandable `AVState` (`getPluginState('av')` /
    `getAVState`). Playback controls reach the viewer's control bar through core's
    media-agnostic `transport-chrome` seam.

    **Captions.** `AVState` publishes the current canvas's captions —
    `captionTracks`, `activeCaptionTrack` and `setCaptionTrack` — so a host can
    switch a track on rather than waiting for a reader to find the control. Only
    tracks the canvas can actually paint are offered: a sound recording attaches its
    tracks for the transcript to read, and a canvas whose picture is a companion
    hides the element behind it. A track is offered only once its file has parsed
    with cues in it, so the offered set grows asynchronously and `subscribe` is what
    says when.

    Captions are held clear of the control bar. The bar floats over the foot of the
    picture, which is exactly where an auto-placed WebVTT cue lands, so a reader with
    the controls up could not read them. The plugin lifts the showing track's cues by
    what the bar covers, through WebVTT's own `line`/`lineAlign` placement — the cue
    box is painted in the user agent's shadow DOM, where no stylesheet or measurement
    of ours reaches — and puts them back down when the bar goes. A cue the WebVTT
    file placed itself is left alone, and the lift is capped so a shallow canvas does
    not lose its captions off the top instead.

    **Notes.** The plugin lists a claimed canvas's timed manifest annotations beside
    the transcript, as a Notes section: each note's time span and text in time order,
    the notes covering the playhead marked as the recording moves, and a click
    seeking to a note's start without starting playback. A note is listed only when
    its target parses to a temporal media fragment and its body is a `TextualBody`
    with no `format` or `text/plain`; HTML, external and image bodies and
    whole-canvas comments are skipped rather than guessed at. The rows share the
    transcript's lazy chunk, marking, formatting and keyboard handling.
    Media-fragment times are read through core's own `parseIiifTime`.

    **Fixed:** a caption track filled less than its canvas. The plugin's own rule for
    the media element's height lost to core's published preflight reset
    (`.viewer-root video { height: auto }`), which collapsed a video to the user
    agent's default 150px and left the stage's black ground showing under the
    picture.

### Patch Changes

- Updated dependencies [34742cb]
- Updated dependencies [34742cb]
    - @triiiceratops/plugin-sdk@1.0.0
    - triiiceratops@1.0.0
