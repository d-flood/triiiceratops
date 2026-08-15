/**
 * The pictures this plugin's chrome wears, as sanitized {@link IconDescriptor}s
 * core renders.
 *
 * The transport glyphs live here rather than in core's generated icon table
 * because core's table is indexed dynamically and therefore never tree-shaken:
 * every entry is shipped bytes for every page, whether or not a viewer ever
 * registers playback chrome. Supplying them from the claimant keeps them on the
 * bundle that needs them.
 *
 * All of them are Phosphor "regular" glyphs on the Phosphor `0 0 256 256`
 * viewBox, the same family and weight core's own codegen draws from.
 */

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

/** Phosphor `Play`. */
const PLAY_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z"/></svg>',
);

/** Phosphor `Pause`. */
const PAUSE_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M200,32H160a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm0,176H160V48h40ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Zm0,176H56V48H96Z"/></svg>',
);

/**
 * Phosphor `SpeakerHigh` — the control's picture while sound is ON, which is
 * the state the button offers to leave.
 */
const SPEAKER_HIGH_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z"/></svg>',
);

/** Phosphor `SpeakerSlash` — the picture while sound is muted. */
const SPEAKER_SLASH_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L73.55,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V175.09l42.08,46.29a8,8,0,1,0,11.84-10.76ZM32,96H72v64H32ZM144,207.64,88,164.09V95.89l56,61.6Zm42-63.77a24,24,0,0,0,0-31.72,8,8,0,1,1,12-10.57,40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.59Zm-80.16-76a8,8,0,0,1,1.4-11.23l39.85-31A8,8,0,0,1,160,32v74.83a8,8,0,0,1-16,0V48.36l-26.94,21A8,8,0,0,1,105.84,67.91ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z"/></svg>',
);

/** Phosphor `ClosedCaptioning` — the alternative-text-track control. */
const CLOSED_CAPTIONING_ICON: IconDescriptor = svgIcon(
    '<svg viewBox="0 0 256 256"><path d="M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192ZM118.92,151.71A8,8,0,0,1,116,162.64a40,40,0,1,1,0-69.28,8,8,0,1,1-8,13.85,24,24,0,1,0,0,41.58A8,8,0,0,1,118.92,151.71Zm80,0A8,8,0,0,1,196,162.64a40,40,0,1,1,0-69.28,8,8,0,1,1-8,13.85,24,24,0,1,0,0,41.58A8,8,0,0,1,198.92,151.71Z"/></svg>',
);

/**
 * The transport's pictures, as core's `TransportChromeIcons` names them.
 *
 * The names are STATES, not actions: core renders `play` while playback is
 * paused and `mute` while sound is muted, so `mute` is the crossed-out speaker
 * a muted player shows. The button's accessible name is the action, and it
 * comes off the labels instead.
 */
export const TRANSPORT_ICONS = {
    play: PLAY_ICON,
    pause: PAUSE_ICON,
    mute: SPEAKER_SLASH_ICON,
    unmute: SPEAKER_HIGH_ICON,
    tracks: CLOSED_CAPTIONING_ICON,
};
