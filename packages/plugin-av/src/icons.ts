import { svgIcon, type IconDescriptor } from '@triiiceratops/plugin-sdk';

/**
 * The toolbar glyph, validated and sanitized through the SDK's {@link svgIcon}
 * into a core-owned {@link IconDescriptor} (core owns the `<svg>` wrapper,
 * sizing, color, and a11y).
 *
 * The path is the Phosphor "regular" `FilmStrip` glyph core's own icon codegen
 * draws from, on the Phosphor `0 0 256 256` viewBox.
 */
export const FILM_STRIP_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,88h80v80H40Zm96-16V56h32V72Zm-16,0H88V56h32Zm0,112v16H88V184Zm16,0h32v16H136Zm0-16V88h80v80Zm80-96H184V56h32ZM72,56V72H40V56ZM40,184H72v16H40Zm176,16H184V184h32v16Z"/></svg>',
);
