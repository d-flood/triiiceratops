# Points persist as IIIF `PointSelector` with integer canvas-pixel coordinates

The point tool writes a true `{type: 'PointSelector', x, y}` target at the exact click
point, with `x`/`y` rounded once to integer canvas pixels (matching IIIF cookbook
usage; decisions D2/D3) — not the previous zoom-dependent 2-screen-pixel fragment
rectangle. Floats were rejected as spurious precision that diffs noisily and diverges
from published IIIF examples. Legacy fragment-rect "points" keep a read-compat fallback
(fragment-center derivation) for one release; new writes never produce them.
