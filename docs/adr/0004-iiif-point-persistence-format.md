# Points persist as IIIF `PointSelector` with integer canvas-pixel coordinates

The point tool writes a true `{type: 'PointSelector', x, y}` target at the exact click
point, with `x`/`y` rounded once to integer canvas pixels (matching IIIF cookbook
usage; decisions D2/D3) — not the previous zoom-dependent 2-screen-pixel fragment
rectangle. Floats were rejected as spurious precision that diffs noisily and diverges
from published IIIF examples. There is no read-compatibility path for legacy fragment-rectangle
"points": the fallback this decision once allowed was unreachable — the predicate
guarding it classified a fragment rectangle as a rectangle regardless of a legacy
`point-` id — and it went with the Annotorious drawing surface. `PointSelector` is
the only point representation the editor writes or reads.
