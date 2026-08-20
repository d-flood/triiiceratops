---
'@triiiceratops/plugin-image-export': minor
---

Rename the package from `@triiiceratops/plugin-image-download` to `@triiiceratops/plugin-image-export`. npm's registry rejects the word "download" in new package names (400 "That word is not allowed"), so the package could not be published under its previous name. The plugin's registry id (the `definePlugin` name and the `window.Triiiceratops.plugins` key) tracks the package name and is now `@triiiceratops/plugin-image-export`. No runtime behavior, exported class (`ImageDownloadPlugin`), helper, or type name changes — only the package identity.
