---
'@triiiceratops/plugin-sdk': patch
---

Republish to supersede `1.0.0-rc.1`, whose published tarball carried a
`workspace:^` peer-dependency protocol on `triiiceratops` (a leftover from
monorepo linking that was never rewritten to a real semver range). npm cannot
parse `workspace:` and crashed consumer installs with `EUNSUPPORTEDPROTOCOL`.

The release pipeline now rewrites `workspace:` ranges to real semver before
packing and hard-fails the pack if any residual `workspace:` protocol survives
in a packed tarball, so this cannot regress. No SDK source changed — this
changeset only cuts a new version through the corrected pipeline.
