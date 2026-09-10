---
'triiiceratops': minor
---

Every button in the control bar now has a hover tooltip. The zoom and canvas-navigation buttons were the only chrome in the viewer without one — the toolbar's buttons and the transport's play, mute, captions and transcript controls all had them, so the bar labelled some of its controls and not others. Tooltips point away from the edge the bar is docked to, as the transport's already did, and the trailing button's bubble is anchored to its own end edge so it is not clipped by the viewer border. `Zoom In` and `Zoom Out` were hardcoded English accessible names and are now translated, since the tooltip makes them visible text.
