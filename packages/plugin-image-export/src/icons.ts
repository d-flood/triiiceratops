import { svgIcon, type IconDescriptor } from '@triiiceratops/plugin-sdk';

/**
 * The toolbar glyph, authored as a full SVG string and validated/sanitized
 * through the SDK's {@link svgIcon} into a core-owned {@link IconDescriptor}
 * (core owns the `<svg>` wrapper, sizing, color, and a11y).
 *
 * The path is the Phosphor "regular" `DownloadSimple` glyph core also ships
 * (icon codegen source), on the Phosphor `0 0 256 256` viewBox.
 */

const VIEW_BOX = '0 0 256 256';

const DOWNLOAD_SIMPLE_PATH =
    '<path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/>';

/** The toolbar icon descriptor (the download glyph), validated by `svgIcon`. */
export const DOWNLOAD_ICON: IconDescriptor = svgIcon(
    `<svg viewBox="${VIEW_BOX}">${DOWNLOAD_SIMPLE_PATH}</svg>`,
);
