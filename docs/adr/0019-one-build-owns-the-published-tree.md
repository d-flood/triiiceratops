# 0019 — One build owns the published tree

## Status

Accepted.

## Context

The published site used to be four independent builds — a SvelteKit marketing
site, a Zensical documentation site in Python, a playground and a bare viewer —
merged into one tree by an assembly script. None of the four could see the
others, and three mechanisms existed only to reconcile that:

- **A durable `docs-site` storage branch.** Each deploy restored the previous
  tree, wrote its own subtrees over it, force-pushed the result back and uploaded
  it. It existed to preserve immutable documentation version directories, and to
  preserve subtrees a path-filtered job had not rebuilt.
- **Publish-layer documentation versioning.** Each release published into
  `/docs/<major.minor>/`, and the assembly generated a `/latest/` alias, a
  `/versions/` index, a `versions.json` manifest, a site-wide sitemap re-rooted
  from the subtrees' own sitemaps, and a `noindex` pass over archived versions.
- **A reserved-top-level-name guard.** The marketing site was copied into a root
  that already held its siblings, so a marketing route named after one of them
  overwrote it. Two guards compared through one module, and the module's own
  comment called this "the only decision in the site's design that cannot be
  undone later".

By the time of this change every route — the marketing pages, the documentation,
the playground and the bare viewer — was a route of one SvelteKit application on
the static adapter, and its build output was already the whole published tree.
Every one of the three mechanisms was guarding a hazard that no longer existed.

## Decision

**One build emits the entire published tree, and deploy is build-and-upload.**

- The assembly script is deleted. What it produced is absorbed: the sitemap was
  already prerendered from the route declaration, the crawl policy is now a
  prerendered route of its own, the social images and the consumer examples are
  static passthrough, and the domain file is written by the existing post-build
  step.
- **Documentation versioning is retired.** One tree at `/docs/`; no version
  alias, no version index, no version manifest, no version switcher. The one
  previously published version directory is retired to the not-found page rather
  than redirected — a static host cannot redirect, and nothing had shipped: the
  workspace was at `1.0.0-rc.36` and the published manifest listed exactly one
  pre-release version.
- **The reserved-name guard is deleted**, along with both call sites and its unit
  test. Two reserved names survive as facts of the tree rather than as a guard:
  the domain file and the crawl policy.
- **The `docs-site` branch is deleted**, with its restore logic and its
  empty-restore guards. The deploy job holds no `contents: write`.
- **`workflow_dispatch` survives as a ref input driving a normal build and
  deploy.** Rollback takes the same path every deploy takes.
- **The build is a function of the commit.** Kit's build version is pinned to the
  commit SHA rather than left as its default timestamp, so two deploys of one ref
  emit the same bytes and "redeploy this ref" can be checked against what is
  served.

## Consequences

A deploy has no state to carry forward and nothing to corrupt: no branch, no
restore, no accumulated directories. A rollback is a build of an older ref, which
is more trustworthy than force-pushing a stored tree, because what gets served is
what this repository says at that ref rather than a snapshot nothing re-derives.
The URL contract gate asserts the tree the deploy will upload rather than a
reconstruction of it.

What this gives up is real and accepted:

- **A reader pinned to an old release has nowhere to go.** Retired versioned URLs
  land on the not-found page. This is affordable exactly once — while nothing has
  shipped — and reintroducing versioning later means republishing under a new
  layout, not restoring this machinery.
- **A rollback needs the old ref to still build.** The storage branch could
  republish a tree whose toolchain no longer existed. A ref that cannot build
  cannot be deployed, so a rollback across a dependency break is a build fix
  rather than a force-push.
- **The reserved-name decision is now reversible in the direction that matters.**
  A route may take any top-level name, because there is no sibling subtree for it
  to shadow. What is not reversible is the reverse: reintroducing a sibling
  subtree would need the guard back.
