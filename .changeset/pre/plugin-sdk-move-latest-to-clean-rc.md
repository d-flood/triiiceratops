---
'@triiiceratops/plugin-sdk': patch
---

Cut a fresh rc so the `latest` dist-tag moves off the broken `1.0.0-rc.1` (which
shipped `triiiceratops: workspace:^` and crashes bare `npm install` with
`EUNSUPPORTEDPROTOCOL`). The corrected `rc.2` is already published, but under npm
OIDC trusted publishing a dist-tag can only be set at publish time — there is no
post-publish `npm dist-tag` — so pointing `latest` at a clean version requires
publishing a new version to `latest`. No source changed.
