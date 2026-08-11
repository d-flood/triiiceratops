---
'@triiiceratops/plugin-image-export': patch
---

Fix unreadable alert text in the image-download panel under the dark themes.

The panel's result and error alerts coloured their text with `--tri-color-success-content` / `--tri-color-error-content`. Those are **on-accent** foregrounds — `Button` and `Badge` pair them with the accent as the *background* — so they are dark in every theme, light and dark alike. The alert's fill is only 8% accent mixed into the panel surface, so against it those tokens are dark-on-light in a light theme (readable by luck) and dark-on-dark in a dark one. Measured in the browser, the error text sat at 1.11:1 in `dark` and 1.57:1 in `dracula`, and the success text at 1.38:1 and 1.58:1 — effectively invisible.

The text is now `--panel-fg` mixed 45% toward the accent. That is correct in both polarities by construction, because `--panel-fg` is the colour each theme already guarantees against its panel surface: the text lightens in a dark theme and darkens in a light one on its own, with no per-theme override to keep in sync. The hue still reads clearly as error or success, and every alert kind across all four shipped themes now measures at least 6.58:1 — comfortably past AA for body text rather than sitting on the threshold. The neutral alert needs no special case, since its accent *is* `--panel-fg` and the mix collapses to it.

The `--tri-input-bg` fallbacks in the fill and border also change from `#fff` to `transparent`, matching the sibling `pdf-export` panel, so a missing surface token shows the panel through rather than painting a white card into a dark theme.
