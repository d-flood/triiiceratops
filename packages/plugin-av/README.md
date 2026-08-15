# @triiiceratops/plugin-av

Audio and video for the [Triiiceratops](https://d-flood.github.io/triiiceratops/)
IIIF viewer.

Core is an image viewer. A canvas whose painting bodies are `Sound` or `Video`
gets core's **unsupported presentation** — an honest placard that keeps the
canvas in layout, navigation and the thumbnail strip. This plugin **claims**
those canvases and renders their media instead: a media stage over the canvas
rect, a canvas-anchored transport, waveforms, captions, a transcript panel, and
an `AVState` object the host application can command playback through.

Nothing about it is in core's bundle. Registering it costs 22.6 KB gzip, and its
four heaviest pieces — hls.js, the waveform parsers, the segment sequencer and
the transcript panel — are chunks fetched only when a manifest needs them.

## Install

```bash
pnpm add @triiiceratops/plugin-av
```

`triiiceratops`, `@triiiceratops/plugin-sdk` and `svelte` are peers.

## Registering it

### As a module (any bundler)

```ts
import { AvPlugin } from '@triiiceratops/plugin-av';
```

Then hand it to the viewer the way you hand it any other plugin — the `plugins`
prop in Svelte, React and Vue, or the `.plugins` **property** (never an
attribute) on the `<triiiceratops-viewer>` custom element:

```js
document.querySelector('triiiceratops-viewer').plugins = [AvPlugin];
```

### As a script tag (IIFE)

Two things are different here from every other Triiiceratops plugin, and both
matter.

**Host the `dist` DIRECTORY, not one file out of it.** The lazy chunks are
sibling ES modules that the entry `import()`s by a URL resolved against its own
`document.currentScript.src`. Copy `node_modules/@triiiceratops/plugin-av/dist/`
somewhere your server serves it and point the script tag inside that directory.
A deployment that copies only `iife.js` works until a reader reaches anything a
chunk serves — an HLS stream (`av-hls.js`), a canvas with linked waveform data
(`av-waveform.js`), a canvas whose duration is tiled by several media files
(`av-sequencer.js`), or a caption track that loaded with cues in it
(`av-transcript.js`) — and then 404s.

**Core's script must load first.** Unlike other plugins this one does not bundle
a Svelte runtime; it reads core's off `window.Triiiceratops`, which is what keeps
it as small as it is. Get the order wrong and you get one named `console.error`
and no registration — not a broken page.

```html
<script src="/assets/triiiceratops-element.iife.js"></script>
<script src="/assets/plugin-av/iife.js"></script>

<triiiceratops-viewer id="viewer"></triiiceratops-viewer>
<script>
    // Loading the script only registers a factory; activation is per-viewer.
    document.getElementById('viewer').plugins = [
        window.Triiiceratops.plugins.get('@triiiceratops/plugin-av'),
    ];
</script>
```

The shared runtime is a **first-party arrangement, not a pattern to copy**:
`svelte/internal` is private, unversioned API, and it is only safe here because
core and this plugin are built and released from one repository at one Svelte
version. The plugin pins `coreRange` to an exact core version to say so, and
refuses to activate against anything else. If you are writing your own plugin,
[bundle your own Svelte runtime](https://d-flood.github.io/triiiceratops/plugin-authoring/).

## Commanding playback: `AVState`

The plugin publishes its playback state through core's published-state seam, so
a host commands media exactly as it commands the viewer — through viewer state,
never by importing the object. `getAVState` is a typed accessor over
`viewerState.getPluginState('av')`; it returns `null` whenever the plugin is not
active on that viewer (absent, failed, or retrying).

```ts
import { getAVState } from '@triiiceratops/plugin-av';

const viewer = document.querySelector('triiiceratops-viewer');
const av = getAVState(viewer.viewerState);
if (av) {
    av.seek(30);
    av.play();

    // Batched, payload-free: a notification means "read what you need".
    const stop = av.subscribe(() => {
        console.log(av.paused ? 'paused' : 'playing', 'of', av.duration);
    });

    // The playhead has its own, finer cadence and does NOT notify `subscribe`.
    const stopClock = av.subscribeFrame(() => {
        scrubber.value = String(av.currentTime);
    });
}
```

| Member                                                    | Kind       | Notes                                              |
| --------------------------------------------------------- | ---------- | -------------------------------------------------- |
| `play()` `pause()` `seek(s)` `setMuted(b)` `setVolume(v)` | command    | address the **current** canvas's media             |
| `paused` `duration` `buffering` `activeMediaCanvasId`     | observable | notify through `subscribe`, batched                |
| `currentTime`                                             | query-only | read it on `subscribeFrame`, never off `subscribe` |

Three contract points worth stating plainly:

- **All times are canvas time.** `duration` is the canvas's duration and
  `seek()` takes a canvas-time position, even when several media files tile that
  canvas. `seek` clamps to `[0, duration]`.
- **Nothing throws at the host.** A `play()` the browser's autoplay policy
  refuses resolves into state — still paused — rather than into a rejected
  promise or an exception.
- **Commands against a non-AV current canvas are refused**, through the
  plugin error channel's `command` phase, not by throwing.

Multi-target addressing (`seek(canvasId, t)`) is a compatible future extension
and deliberately not in this version: there is one transport, anchored to the
current canvas, and every other visible AV canvas shows a play-state glyph.

## What it renders

- **Stage layout.** The claimed canvas rect is divided into vertical lanes in
  canvas space, so the whole stack pans and zooms with the viewer. Video takes
  the whole rect as a visual lane. Audio with no accompanying image gives the
  whole rect to the timeline lane. Audio with an accompanying image puts the
  image above and a timeline strip (~25%) below. The strip draws a waveform only
  when the canvas links audiowaveform data; otherwise it is a bare timeline.
- **Timeline projection.** Canvas x maps linearly to media time, so the viewer's
  own zoom doubles as temporal zoom into the waveform and a tap on the timeline
  lane is a seek.
- **Transport.** Play/pause, a real `role="slider"` scrubber with arrow-key
  seeking and buffered ranges, elapsed/total time, mute and volume, and a
  captions control when tracks exist. Anchored to its canvas at constant screen
  size; below a width threshold it gives way to a play-state glyph. Every label
  comes from the plugin's own locale catalog in the viewer's active locale.
  Native `controls` are never shown.
- **Waveform.** Drawn from audiowaveform data linked from the canvas, parsed
  into one **peaks model** whichever on-disk format arrived. Temporal zoom
  sharpens only to the data's own resolution and never fabricates detail.
- **Transcript panel.** The current canvas's VTT cues as a list of timestamped,
  keyboard-operable buttons: the cue at the playhead is marked, clicking one
  seeks without starting playback, and following the playhead stops the moment
  you scroll away. Audio and video alike — it is how a sound recording's words
  become readable, since an `<audio>` element has no area to paint captions in.
  The captions **toggle** is video-only for that same reason.

## Manifest shapes it understands

| Shape                                               | Behavior                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sound` / `Video` painting bodies                   | claimed and played                                                                                                                                                                                                                                                                                                                |
| `Choice` of formats                                 | the rendition is picked by what the browser can actually decode, not first-wins; a host override through the viewer's choice-selection commands preserves position across the swap                                                                                                                                                |
| HLS (`.m3u8`)                                       | native where the browser has it, otherwise through an on-demand hls.js chunk                                                                                                                                                                                                                                                      |
| Captions                                            | WebVTT, from a body whose `format` is exactly `text/vtt` (the `Text` type is not sufficient and is not what is checked), in the painting annotation or a canvas-level `supplementing` annotation. Attached `hidden` so cues parse; a track that fails to load or carries no cues is dropped rather than offered as a dead control |
| `placeholderCanvas`                                 | a poster before playback — the `<video poster>` when it is a plain image URL, an overlay image otherwise                                                                                                                                                                                                                          |
| `accompanyingCanvas`                                | rendered statically above the timeline strip                                                                                                                                                                                                                                                                                      |
| `start`, `#t=` on structures, content-state targets | a **temporal offset**: the playhead is positioned. Always a seek, never autoplay                                                                                                                                                                                                                                                  |
| `behavior: auto-advance` / `repeat`                 | playback continues into the next canvas; `repeat` (a Collection/Manifest term, and dependent on `auto-advance`) returns to the first canvas at the end                                                                                                                                                                            |
| Several media bodies tiling one canvas via `#t=`    | one **canvas timeline** under one transport, with a sequencer swapping segments at each boundary                                                                                                                                                                                                                                  |

## Documented limitations

These are contracts, not bugs. Each is a deliberate v1 fence:

- **No MPEG-DASH.** HLS and progressive files only.
- **A brief gap at each segment seam.** A temporally composed canvas swaps media
  elements at the boundary; gapless `MediaSource` stitching is not implemented.
- **WebVTT captions only.** No TTML, no SRT, no annotation-derived captions, and
  no caption styling controls.
- **Only embedded annotations are read** for caption tracks. A canvas whose
  annotation page is an external reference contributes no tracks; no page is
  ever fetched.
- **Spatially placed media renders full-rect or not at all.** A painting body
  targeted at `#xywh=` is not placed within the canvas — the Cookbook's
  `0489-multimedia-canvas` is the one recipe affected, and it degrades to its
  image body with a developer-console warning.
- **No waveform on a temporally composed canvas**, and no waveform computed in
  the browser: peaks come from data the manifest links.
- **Accompanying and placeholder images are static.** One appropriately-sized
  request at claim time, no deep zoom.
- **No quality picker, playback rate, fullscreen or picture-in-picture** in the
  transport. Rendition switching is host-driven through the viewer's
  choice-selection commands.
- **AV canvases are excluded from image and PDF export** by documented contract,
  and a claimed canvas leaves `annotatableCanvasIds` — there is no rectangle
  tool over a video.
- **Time-based annotation is not supported.** Annotations targeting a `#t=`
  range load without crashing, but are not shown against the playhead.

- **Media must be CORS-readable.** Every media element is created in CORS mode
  (`crossOrigin = 'anonymous'`), because a `<track>` is only fetched at all when
  it is, and essentially every Cookbook caption recipe is cross-origin. The cost
  is that the requirement lands on the _media_ too: a file or stream served
  without an `Access-Control-Allow-Origin` header that admits your viewer's
  origin will fail to load and show the "can't play" treatment, even though the
  same URL plays in a plain `<video>` tag. This is the first thing to check when
  media that works elsewhere will not play here. No credentials are ever sent,
  so `Access-Control-Allow-Origin: *` is enough.

A stream that cannot play — a dead URL, a CORS or CSP refusal, an offline reader
— shows a localized "can't play this" treatment in that canvas's stage. One bad
stream costs one canvas, never the session.

## Bundle

`dist/iife.js` is 21,402 gzip bytes. Registered alongside core's element it makes
140,369 gzip, which is enforced as a standing budget against TIFY — the nearest
audiovisual-capable viewer measured — in CI. The four lazy chunks are outside
that figure:

| Chunk              |    gzip | Fetched when                                             |
| ------------------ | ------: | -------------------------------------------------------- |
| `av-hls.js`        | 223,530 | an HLS body must play without native HLS support         |
| `av-waveform.js`   |   2,584 | a canvas links waveform data                             |
| `av-sequencer.js`  |   2,094 | a canvas is painted by several media tiling its duration |
| `av-transcript.js` |   2,058 | the current canvas has a caption track with cues         |

See the
[bundle-size comparison](https://d-flood.github.io/triiiceratops/bundle-size-comparison/)
for the full method and the per-recipe Cookbook results.

## License

MIT
