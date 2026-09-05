# Social preview cards

Maintainer notes for `scripts/social-cards.mjs` and the images under
`apps/site/static/social/`.

This file lives in `scripts/` rather than beside the images because the images
sit in the site's `static/` tree, which is copied verbatim into the published
site: a README next to them would ship as `/social/social-cards.README.md`.

The images social platforms show when a link to this site is shared. All are
1200×630 PNGs, the size Facebook, X, LinkedIn, Slack and Discord all want.

| File                                   | Used by                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `og-landing-v1.png`                    | every marketing route, declared by the marketing-chrome layout         |
| `og-docs-v1.png`                       | every documentation page, declared by the marketing-chrome layout      |
| `og-viewer-v1.png`                     | the `/demo/` playground only                                           |
| `scripts/social-cards/viewer-dark.jpg` | build input: the viewer screenshot `og-viewer-v1.png` is composed from |
| `scripts/social-cards/logo.png`        | build input: the wordmark drawn onto every card                        |

One card per promise rather than one for the whole site, because the links
promise different things. The landing page says "here is what this is"; the docs
root says "read about this library"; `/viewer/` says "click and it runs", so its
card shows the viewer actually running.

## Regenerating

```sh
node scripts/social-cards.mjs              # re-render every card
node scripts/social-cards.mjs --capture    # also re-shoot the viewer screenshot
node scripts/social-cards.mjs --out /tmp/x # render elsewhere, to preview
```

The card layout and copy live in `scripts/social-cards.mjs` as HTML — edit there,
re-run, commit the PNGs. Nothing in CI runs this; the PNGs are committed.

`--capture` additionally needs the built site at `apps/site/build/` (`pnpm
build:site`), which is where the playground is, and network access for the
manuscript's IIIF tiles.

## Renaming a card is not optional cosmetics

Facebook and LinkedIn cache preview images by URL for days to weeks and offer no
reliable way to purge them. **A card is effectively immutable once it has been
shared.** Overwriting `og-docs-v1.png` in place will leave the old image showing
on every link already in circulation, for weeks, with nothing you can do about
it.

So changing a card means publishing it under a _new_ filename. Bump `-v1` to
`-v2` and update **every** reference:

- `scripts/social-cards.mjs` — the output filenames
- `apps/site/src/lib/site.ts` — `OG_IMAGE` (landing card) and `DOCS_OG_IMAGE`
  (documentation card), both declared by the marketing-chrome layout, and
  `PLAYGROUND_OG_IMAGE` (viewer card, declared by the `/demo/` route)
- `site-urls.json` — the `/social/` entry for that card; the URL contract gate
  fails on a card the manifest still promises at its old name
- this file's table

## Where the images are served from

From the site's own `static/social/`, which the build copies verbatim, so that

```
https://triiiceratops.org/social/og-docs-v1.png
```

stays one stable URL across every release. Any path that changed per release
would be a fresh scraper cache miss on every deploy — i.e. a briefly imageless
card. That is also why the port that moved these files into the site left their
published URLs exactly where they were.

## Verifying a change

The tags themselves are emitted by the marketing chrome layout
(`apps/site/src/routes/(chrome)/+layout.svelte`) and, for the playground, by the
`/demo/` route. After a deploy:

- <https://developers.facebook.com/tools/debug/> — Facebook, and the closest
  thing to a cache purge that exists
- <https://cards-dev.twitter.com/validator> — X
- <https://www.linkedin.com/post-inspector/> — LinkedIn
- Slack and Discord: paste the link into any channel you can delete from

Check the publish **root** (`https://triiiceratops.org/`) as well as a
documentation page. It is the URL people actually paste.
