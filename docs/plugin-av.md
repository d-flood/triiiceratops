---
icon: lucide/film
description: "Play a IIIF canvas's audio and video: a media stage over the canvas rect, playback controls in the viewer's own control bar, waveforms, captions, and a transcript panel."
---

# Audio & Video

Core is an image viewer. A canvas whose painting bodies are `Sound` or `Video` gets
core's **unsupported presentation** — an honest placard that keeps the canvas in
layout, navigation, and the thumbnail strip, but plays nothing.

`@triiiceratops/plugin-av` **claims** those canvases and renders their media
instead: a media stage over the canvas rect, playback controls in the viewer's own
control bar, waveforms, captions, a transcript panel, and an `AVState` object your
application can command playback through.

!!! info "Audiovisual support is opt-in"

    None of it is in core's bundle, and none of it activates unless you add the
    plugin to a viewer's `plugins` list. Registering it costs 15.5 KB gzip, and its
    four heaviest pieces are [lazy chunks](#bundle) fetched only when a manifest
    needs them. A page of scanned folios pays nothing.

## Install

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-av
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-av
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-av
    ```

`triiiceratops`, `@triiiceratops/plugin-sdk`, and `svelte` are peers.

## Registering it

`AvPlugin` is exported ready to use with no configuration. Hand it to the viewer
the way you hand it any other plugin — see [adding a plugin to your
viewer](plugins.md#adding-a-plugin-to-your-viewer) for the full per-framework
code:

=== "HTML"

    ```ts
    import 'triiiceratops/element/register';
    import { AvPlugin } from '@triiiceratops/plugin-av';

    viewer.plugins = [AvPlugin];
    ```

=== "React"

    ```tsx
    import { TriiiceratopsViewer } from 'triiiceratops/react';
    import { AvPlugin } from '@triiiceratops/plugin-av';

    const plugins = [AvPlugin];

    export function Reader() {
        return (
            <TriiiceratopsViewer
                manifestId="https://example.org/manifest.json"
                plugins={plugins}
                style={{ display: 'block', height: '600px' }}
            />
        );
    }
    ```

=== "Vue"

    ```vue
    <script setup lang="ts">
    import { TriiiceratopsViewer, type SdkPlugin } from 'triiiceratops/vue';
    import { AvPlugin } from '@triiiceratops/plugin-av';

    const plugins: readonly SdkPlugin[] = [AvPlugin];
    </script>

    <template>
        <TriiiceratopsViewer
            manifest-id="https://example.org/manifest.json"
            :plugins="plugins"
            style="display: block; height: 600px"
        />
    </template>
    ```

=== "Svelte"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops/svelte';
        import 'triiiceratops/style.css';
        import { AvPlugin } from '@triiiceratops/plugin-av';
    </script>

    <TriiiceratopsViewer
        manifestId="https://example.org/manifest.json"
        plugins={[AvPlugin]}
    />
    ```

### As a script tag (IIFE)

Two things are different here from every other Triiiceratops plugin, and both
matter.

**Host the `dist` DIRECTORY, not one file out of it.** The lazy chunks are sibling
ES modules the entry `import()`s by a URL resolved against its own
`document.currentScript.src`. Copy
`node_modules/@triiiceratops/plugin-av/dist/` somewhere your server serves it and
point the script tag inside that directory. A deployment that copies only
`iife.js` works until a reader reaches anything a chunk serves — an HLS stream, a
canvas with linked waveform data, a canvas whose duration is tiled by several media
files, or a caption track that loaded with cues in it — and then 404s.

**Core's script must load first.** Unlike other plugins this one does not bundle a
Svelte runtime; it reads core's off `window.Triiiceratops`, which is what keeps it
as small as it is. See [script order](plugins.md#script-order-triiiceratopsplugin-av-loads-after-core)
for what the diagnostic looks like when the order is wrong.

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
[bundle your own Svelte runtime](plugin-authoring.md).

## What it renders

- **Stage layout.** The claimed canvas rect is divided into lanes in canvas space,
  so the whole stack pans and zooms with the viewer. Video takes the whole rect as
  a visual lane. Audio takes the whole rect as a timeline lane, which draws a
  waveform when the canvas links audiowaveform data and is a bare timeline
  otherwise. A canvas core paints a companion Canvas into gets no lanes at all —
  the rect belongs to the renderer, and the stage contributes only a tap target,
  the play-state glyph and the "can't play" notice. That covers a canvas with an
  `accompanyingCanvas`, and a canvas with a `placeholderCanvas` until its first
  play, so a recording published with a poster shows no waveform until it starts
  playing. Because the lane is a region of the rect, it keeps the canvas's own
  aspect ratio: a publisher that declares a very wide, very short audio canvas
  gets a correspondingly shallow lane.
- **Timeline projection.** Canvas x maps linearly to media time, so the viewer's
  own zoom doubles as temporal zoom into the waveform, and a tap on the timeline
  lane is a seek.
- **Transport.** Play/pause, a real `role="slider"` scrubber with arrow-key seeking
  and buffered ranges, elapsed/total time, mute and volume, and a captions control
  when tracks exist. It is registered into core's control bar through the
  `transport-chrome` seam, so it is themed and placed like the rest of the viewer's
  chrome. There is exactly one, driving the current canvas; every other claimed
  canvas on screen carries a decorative play-state glyph on its own stage, so a
  reader with several recordings in view can tell which one is playing. Every label
  comes from the plugin's own locale catalog in the viewer's active locale. Native
  `controls` are never shown.

    While the transport is registered, `nav.align` is **inert** and the control bar
    spans its full width — the seek bar's width is the precision a reader aims
    with. `nav.style`, `nav.edge`, and `controls` go on meaning exactly what they
    meant. See [nav alignment and playback
    controls](configuration.md#nav-alignment-and-playback-controls).

- **Waveform.** Drawn from audiowaveform data linked from the canvas, parsed into
  one peaks model whichever on-disk format arrived. Temporal zoom sharpens only to
  the data's own resolution and never fabricates detail.
- **Transcript panel.** A list of timestamped, keyboard-operable buttons: the entry
  at the playhead is marked, clicking one seeks without starting playback, and
  following the playhead stops the moment you scroll away. It draws on three things
  the current canvas may offer, and lists whichever of them are there:

    | Source | IIIF shape |
    | :-- | :-- |
    | Caption cues | the WebVTT track behind the captions control |
    | The manifest's timed notes | commentary annotations whose `target` carries `#t=` and whose body is a `text/plain` `TextualBody`, earliest first (Cookbook 0103). `motivation` is never inspected |
    | An untimed transcript | one `text/plain` file linked from the canvas's `rendering` (Cookbook 0017) |

    Audio and video alike — it is how a sound recording's words become readable,
    since an `<audio>` element has no area to paint captions in. The captions
    **toggle** is video-only for that same reason. The toolbar button is absent on a
    canvas offering none of the three, so the panel is never opened onto nothing,
    and it is named for what it actually holds: **Transcript** when there is one,
    **Notes** when the canvas offers only the manifest's timed commentary.

## Commanding playback: `AVState`

The plugin publishes its playback state through core's published-state seam, so a
host commands media exactly as it commands the viewer — through viewer state, never
by importing the object. `getAVState` is a typed accessor over
`viewerState.getPluginState('av')`; it returns `null` whenever the plugin is not
active on that viewer (absent, failed, or retrying).

```ts
import { getAVState } from '@triiiceratops/plugin-av';

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

- **All times are canvas time.** `duration` is the canvas's duration and `seek()`
  takes a canvas-time position, even when several media files tile that canvas.
  `seek` clamps to `[0, duration]`.
- **Nothing throws at the host.** A `play()` the browser's autoplay policy refuses
  resolves into state — still paused — rather than into a rejected promise or an
  exception.
- **Commands against a non-AV current canvas are refused**, through the plugin
  error channel's `command` phase, not by throwing.

Multi-target addressing (`seek(canvasId, t)`) is a compatible future extension and
deliberately not in this version: there is one transport, anchored to the current
canvas, and every other visible AV canvas shows a play-state glyph.

To open at a media time rather than command one after the fact, pass a temporal
offset to `setCanvas` — see [media time](configuration.md#media-time).

## Manifest shapes it understands

| Shape                                               | Behavior                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sound` / `Video` painting bodies                   | claimed and played                                                                                                                                                                                                                                                                                                              |
| `Choice` of formats                                 | the rendition is picked by what the browser can actually decode, not first-wins; a host override through the viewer's choice-selection commands preserves position across the swap                                                                                                                                              |
| HLS (`.m3u8`)                                       | native where the browser has it, otherwise through an on-demand hls.js chunk                                                                                                                                                                                                                                                    |
| Captions                                            | WebVTT, from a body whose `format` is exactly `text/vtt` (the `Text` type is not sufficient and is not what is checked), in the painting annotation or a canvas-level `supplementing` annotation. Attached `hidden` so cues parse; a track that fails to load or carries no cues is dropped rather than offered as a dead control |
| `placeholderCanvas`                                 | a poster before playback — the `<video poster>` when it is a plain image URL, an overlay image otherwise                                                                                                                                                                                                                        |
| `accompanyingCanvas`                                | painted by core into the whole canvas rect, behind a transparent stage that draws no lanes                                                                                                                                                                                                                                                                                    |
| `start`, `#t=` on structures, content-state targets | a **temporal offset**: the playhead is positioned. Always a seek, never autoplay                                                                                                                                                                                                                                                |
| `behavior: auto-advance` / `repeat`                 | playback continues into the next canvas; `repeat` (a Collection/Manifest term, and dependent on `auto-advance`) returns to the first canvas at the end                                                                                                                                                                          |
| Several media bodies tiling one canvas via `#t=`    | one **canvas timeline** under one transport, with a sequencer swapping segments at each boundary                                                                                                                                                                                                                                |
| Annotations targeting `#t=`                         | listed in the transcript panel in canvas time, earliest first, each one a seek. `text/plain` `TextualBody` only; any other body is skipped rather than guessed at                                                                                                                                                                |
| `rendering` with `format: text/plain`               | adopted as the canvas's untimed transcript. `format` is trusted here and nothing else is accepted — a PDF, HTML or TEI transcript needs parsing this bundle does not carry, and stays reachable as a link in core's metadata panel                                                                                              |

## CORS

**Media must be CORS-readable.** Every media element is created in CORS mode
(`crossOrigin = 'anonymous'`), because a `<track>` is only fetched at all when it
is, and essentially every Cookbook caption recipe is cross-origin. The cost is that
the requirement lands on the *media* too: a file or stream served without an
`Access-Control-Allow-Origin` header that admits your viewer's origin will fail to
load and show the "can't play" treatment, even though the same URL plays in a plain
`<video>` tag.

This is the first thing to check when media that works elsewhere will not play
here. No credentials are ever sent, so `Access-Control-Allow-Origin: *` is enough.

Your Content Security Policy needs a `media-src` that admits the media host, the
caption host, and `blob:` for HLS — see [audio and video under a strict
CSP](csp.md#audio-and-video).

A stream that cannot play — a dead URL, a CORS or CSP refusal, an offline reader —
shows a localized "can't play this" treatment in that canvas's stage. One bad
stream costs one canvas, never the session.

## Configuring its UI

The plugin's `uiId` is `av`, so it is controlled through `config.plugins.av` like
any other plugin — see [controlling plugin UI through
config](plugins.md#controlling-plugin-ui-through-config). That key governs the
**transcript panel** and its toolbar button; the media stage and the transport are
not plugin chrome and are not switchable.

```ts
viewer.config = {
    plugins: {
        av: { position: 'right', open: true },
    },
};
```

## Documented limitations

These are contracts, not bugs. Each is a deliberate fence for this release:

- **No MPEG-DASH.** HLS and progressive files only.
- **A brief gap at each segment seam.** A temporally composed canvas swaps media
  elements at the boundary; gapless `MediaSource` stitching is not implemented.
- **WebVTT captions only.** No TTML, no SRT, no annotation-derived captions, and no
  caption styling controls.
- **Only embedded annotations are read**, for caption tracks and for the panel's
  timed notes alike. A canvas whose annotation page is an external reference
  contributes neither; no page is ever fetched.
- **Spatially placed media renders full-rect or not at all.** A painting body
  targeted at `#xywh=` is not placed within the canvas — the Cookbook's
  `0489-multimedia-canvas` is the one recipe affected, and it degrades to its image
  body with a developer-console warning.
- **No waveform on a temporally composed canvas**, and no waveform computed in the
  browser: peaks come from data the manifest links.
- **Accompanying and placeholder images are static.** One appropriately-sized
  request at claim time, no deep zoom.
- **No quality picker, playback rate, fullscreen, or picture-in-picture** in the
  transport. Rendition switching is host-driven through the viewer's
  choice-selection commands.
- **AV canvases are excluded from image and PDF export** by documented contract
  (see [Image Download](plugin-image-export.md#audiovisual-canvases) and [PDF
  Export](plugin-pdf-export.md#audiovisual-canvases)), and a claimed canvas leaves
  `annotatableCanvasIds` — there is no rectangle tool over a video.
- **Timed annotations are read, not drawn.** An annotation targeting a `#t=` range
  is listed in the transcript panel and seekable from it, but nothing paints it
  against the playhead or onto the stage, and there is no authoring surface for
  one. A range's end is carried and not enforced.

## Bundle

`dist/iife.js` is about **15.5 KB gzip**. Registered alongside core's element that
makes roughly **128 KB gzip** for the pair, which CI holds under a standing budget
measured against TIFY — the nearest audiovisual-capable viewer. The four lazy
chunks are outside that figure:

| Chunk              | gzip | Fetched when                                             |
| ------------------ | ---: | -------------------------------------------------------- |
| `av-hls.js`        | ~224 KB | an HLS body must play without native HLS support      |
| `av-waveform.js`   | ~2.6 KB | a canvas links audiowaveform data                     |
| `av-sequencer.js`  | ~2.1 KB | a canvas is painted by several media tiling its duration |
| `av-transcript.js` | ~3.2 KB | the current canvas has anything for the panel to hold |

Figures are gzip at level 9, rounded — they move by tens of bytes build to build,
and the byte-exact table lives with the measurement rather than here.

hls.js alone is nearly twice the whole viewer, which is exactly why it is a chunk:
a manifest of MP4s never pays for it.

## Design notes

The plugin is authored entirely on the framework-neutral
[plugin SDK](plugin-authoring.md) — core never imports it. It builds on four
capability seams, and declares each in `requiredCapabilities` so it fails closed
rather than half-working:

| Capability | Without it |
| :-- | :-- |
| `canvas-claim` | the plugin would render over an unsupported-content placard it cannot suppress |
| `transport-chrome` | there would be nowhere to register the playback controls, and it builds none of its own — a staged recording with no way to play it |
| `shared-svelte-runtime` | there is no `window.Triiiceratops` Svelte to consume, and its IIFE bundles none |
| `shared-core-utils` | there are no curated core utilities on the namespace, and its IIFE bundles no copies |

Why audiovisual support is a plugin over a generic canvas claim rather than a core
feature is recorded in
[ADR 0017](adr/0017-av-is-a-plugin-over-a-generic-canvas-claim.md); the
published-state seam `AVState` rides on is
[ADR 0018](adr/0018-published-plugin-state.md).
