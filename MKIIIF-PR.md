# A pull request for `atomotic/iiif`, ready to send

This file is the outreach half of the level-0 rendering fix. It is **not** sent
by anyone but the maintainer of this repository: no branch, pull request, issue
or comment exists in `atomotic/iiif`, and creating one is a deliberate human act.

Everything below was checked against `atomotic/iiif` at commit
`9f68240af3539b72c13fe57666853390dd047edb` ("add Thumbnails", 2026-03-29),
module `github.com/atomotic/iiif`, `go 1.26.1`. Two files change, both under
`cmd/mkiiif/`.

---

## Why this is worth sending

`mkiiif -tiles` generates pages that work, and generates two things that will
stop working or already do.

1. **The painting body 404s.** `main.go:122` composes the body as
   `{service}/full/{width},{height}/0/default.jpg`. `vips dzsave --layout iiif3`
   never writes that file. On the reference page
   (`https://docuver.se/iiif/p3tgsk8jqt/`) the body
   `page-001/full/1446,2004/0/default.jpg` is a 404. Every client that trusts
   the body rather than the service beside it gets nothing.

    Triiiceratops 1.0.0 renders such a canvas from `tiles` regardless, so
    already-published pages are repaired by that release with no action from
    anyone. The body is still wrong, and a client that has no tile pipeline
    — or a `<img>` in a search-result card — still has nothing to fetch.

2. **The viewer is loaded unpinned, and the next release is a major.**
   `viewer.go:16` and `viewer.go:81` load `https://unpkg.com/triiiceratops/…`
   with no version. The current published version is `1.0.0-rc.36`; the next
   publish is `1.0.0`, and it removes configuration keys the embedded template
   sets. Everyone serving a generated page picks that up the moment it
   publishes.

The two halves are one PR because the second is what makes the first urgent.

---

## The changes

### 1. Write a real full-size derivative, and point the body at it

`main.go` already has the source image in hand at the moment it needs one: the
original is not deleted until `main.go:134`. Write
`{tileDir}/full/max/0/default.jpg` from it before that, and compose the body as
`{service}/full/max/0/default.jpg`.

`max` rather than `{width},{height}`: the generated `info.json` declares
`http://iiif.io/api/image/3/context.json`, and `max` is the Image API 3.0
spelling of the whole image at its full size. It is also the URL a level-0
client constructs without being told a size.

```go
// main.go, inside the `if *tiles` branch, before the os.Remove at line 134.
fullDir := filepath.Join(tileDir, "full", "max", "0")
if err := os.MkdirAll(fullDir, 0755); err != nil { /* … */ }
cmd := exec.Command("vips", "jpegsave", img.Path, filepath.Join(fullDir, "default.jpg"))
```

and at line 122:

```go
bodyURL := fmt.Sprintf("%s/full/max/0/default.jpg", serviceURL)
```

### 2. Declare `sizes` in the generated `info.json`

`vips dzsave --layout iiif3` writes `tiles` and no `sizes`. `tiles` alone is
enough to construct every tile URL the Image API defines, so a tiling client can
render from it — but `sizes` is how a level-0 service tells a client which
**whole-image** derivatives exist, and a client that wants one small picture (a
thumbnail, a card, an OCR preview) has nothing to go on.

`tileImage` (`main.go:174`) already reads the generated `info.json` for its
dimensions and scale factors. Patch it there and write it back with two entries:
the lowest-zoom derivative it already computes (`tw`, `th`), and the full
dimensions that change 1 has just made real.

```json
"sizes": [
  { "width": 362, "height": 501 },
  { "width": 1446, "height": 2004 }
]
```

### 3. Pin the viewer, and drop the keys the next release removes

`viewer.go:81`:

```html
<script src="https://unpkg.com/triiiceratops@1.0.0/dist/triiiceratops-element.iife.js"></script>
```

`viewer.go:16` should be **deleted rather than pinned**. There has never been a
`dist/triiiceratops-element.css`: the stylesheet link 404s on every published
version, `1.0.0-rc.35` and `1.0.0-rc.36` included, and it 404s under `1.0.0`
too. The published stylesheet is `dist/triiiceratops.css`, and it is not the one
the custom element wants — the element carries its own styles in its shadow
root, which is why a generated page has always looked right despite the dead
link and why nothing needs to be substituted for it.

```html
<!-- viewer.go:16 — delete; the element needs no external stylesheet -->
```

The embedded `config` needs four keys looked at. They are two different
situations and only the first is a loss.

**Valid in `1.0.0-rc.36`, removed by `1.0.0`.**

- `openSeadragonConfig` (`viewer.go:43`), and therefore `maxZoomPixelRatio`,
  `zoomPerScroll` and `animationTime`. `1.0.0` drops OpenSeadragon for a
  first-party renderer, so the object has nowhere to go. The nearest
  replacements live under a `renderer` object:

    ```json
    "renderer": {
      "zoomPerWheelNotch": 1.5,
      "animationTimeConstant": 0.25,
      "zoomPerClick": 2
    }
    ```

    Not a mechanical translation. `maxZoomPixelRatio` has no counterpart — the new
    renderer's zoom ceiling is derived from the tile pyramid rather than
    configured — and `animationTimeConstant` is a time constant in seconds, not a
    duration, so `animationTime: 1` does not become `1`.

- `gallery.draggable` (`viewer.go:63`). Also removed in `1.0.0`, along with the
  floating gallery it belonged to. The template sets it to `false`, which is
  exactly what the always-docked gallery now does, so **dropping the key changes
  nothing for a generated page**. It is listed here only so it is not mistaken
  for breakage.

**Already inert in `1.0.0-rc.36`.** Neither of these has ever done anything, and
both can be deleted today.

- `gallery.fixedHeight` (`viewer.go:66`). No such key. The knob is
  `gallery.size` — the strip's height when docked to the top or bottom, the
  rail's width when docked to the left or right — so `"size": 102` is what the
  template meant.
- `annotations.visible` (`viewer.go:75`). `AnnotationsConfig` carries `open`,
  `showCloseButton` and `position`, and never carried `visible`.

**Everything else in that template is current** and needs no change:
`showToggle`, `toolbarOpen`, `showCanvasNav`, `showZoomControls`,
`viewingMode`, every `toolbar.show*` key, `gallery.open`,
`gallery.showCloseButton`, `gallery.dockPosition`, the whole `search` object,
`annotations.open`, and `transparentBackground`.

---

## The pull request body

> ### `-tiles`: write the full-size image the manifest points at, declare `sizes`, and pin the viewer
>
> Three changes to `cmd/mkiiif`, all in the `-tiles` path. The first two are
> about the IIIF the tool emits; the third is about the viewer it embeds.
>
> **1. The painting body names a file that is never written.**
> `main.go:122` composes it as `{service}/full/{width},{height}/0/default.jpg`,
> and `vips dzsave --layout iiif3` writes no such derivative — only the tile
> grid and the lowest-zoom `full/{w},{h}`. On a page generated today the body
> is a 404. This writes a real `full/max/0/default.jpg` from the source image
> before `main.go:134` deletes it, and points the body there. `max` is the
> Image API 3.0 spelling and the generated `info.json` is image/3.
>
> **2. `info.json` declares `tiles` and no `sizes`.** A tiling client can work
> from `tiles` alone, but `sizes` is how a level-0 service says which
> whole-image derivatives exist, and without it a client that wants one small
> picture has to guess. `tileImage` already parses `info.json`; this adds the
> two sizes that actually exist — the lowest-zoom derivative and, after change
> 1, the full size — and writes it back.
>
> **3. The embedded viewer is loaded unpinned, and its next release is a
> major.** `viewer.go:16` and `viewer.go:81` fetch
> `https://unpkg.com/triiiceratops/…` with no version. `1.0.0` replaces
> OpenSeadragon with a first-party renderer and removes `openSeadragonConfig`
> and `gallery.draggable`; every page mkiiif has generated would pick that up
> on publish. This pins the script to `1.0.0`, deletes the stylesheet link, and
> updates the embedded config:
>
> - `viewer.go:16` is removed. `dist/triiiceratops-element.css` has never
>   existed on any published version, so that link has always 404'd. The custom
>   element styles itself from its shadow root and needs no external stylesheet,
>   which is why generated pages looked right regardless; the published
>   `dist/triiiceratops.css` is a different artifact and is not a substitute.
> - `openSeadragonConfig` → a `renderer` object (`zoomPerWheelNotch`,
>   `animationTimeConstant`, `zoomPerClick`). `maxZoomPixelRatio` has no
>   counterpart; the new renderer derives its zoom ceiling from the pyramid.
> - `gallery.draggable: false` is dropped. The gallery is always docked in
>   `1.0.0`, so this is what it already does — no behaviour change for readers.
> - `gallery.fixedHeight: 102` → `gallery.size: 102`. `fixedHeight` was never a
>   key; the value has been ignored all along.
> - `annotations.visible: false` is dropped. `AnnotationsConfig` has only
>   `open`, `showCloseButton` and `position`.
>
> Everything else in the template is current in `1.0.0`.
>
> Checked against the published `1.0.0-rc.36` tarball's `dist/types` as well as
> against `1.0.0`, so the "already inert" claims are about the version mkiiif
> users are running right now, not only about the upcoming one.

---

## Notes for whoever sends this

- **Substitute the real version.** `1.0.0` is the release carrying the
  level-0 rendering fix on the Triiiceratops side. If the version that actually
  publishes differs, change it in both URLs and in the PR body before sending.
- The `renderer` values above are a reasonable translation of the template's
  intent, not a computed equivalent. Feel free to drop the object entirely — the
  defaults are good, and the smaller diff is easier to accept.
- Changes 1 and 2 are independent of change 3 and could be sent as two PRs if
  the maintainer would rather review them apart.
