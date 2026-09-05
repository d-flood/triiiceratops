---
'@triiiceratops/plugin-image-manipulation': patch
---

Republish to supersede `1.0.0-rc.1`, whose published tarball carried
`workspace:^` peer-dependency protocols on `triiiceratops` and
`@triiiceratops/plugin-sdk` (leftover monorepo linking that was never rewritten
to real semver ranges). npm cannot parse `workspace:` and crashed consumer
installs with `EUNSUPPORTEDPROTOCOL`. The release pipeline now rewrites
`workspace:` ranges before packing and hard-fails the pack on any residual
`workspace:` protocol, so this cannot regress. No source changed — this
changeset only cuts a new version through the corrected pipeline.
