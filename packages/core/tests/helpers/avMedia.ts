/**
 * The hermetic AV corpus: generated media under `tests/media/`, and the local
 * manifests that paint it.
 *
 * Everything here is served by the dev server's media fixture
 * (`scripts/mediaFixturePlugin.mjs`) at `/media/`, so every URL is same-origin
 * with the Playwright `baseURL` and the AV suite needs no network. The URLs are
 * root-relative for the same reason the demo-manifest fixtures are: they resolve
 * against whatever port the run picked.
 *
 * How the media was made — and what a maintainer must run to change it — is in
 * `tests/media/regenerate.sh`.
 */

/** 2 s of a 440 Hz tone under an amplitude envelope, mono, 44.1 kHz. */
export const TONE_MP3 = '/media/tone.mp3';

/**
 * What a browser reports for the tone, and what the local manifests declare.
 *
 * The file on disk is longer than this. LAME pads the final frame, so a decoder
 * reading every frame — `audiowaveform`, for one — sees 2.014 s (its 347 peaks
 * at 256 samples each, over 44.1 kHz), while a browser honours the encoder's
 * gapless metadata and trims back to 2.0. The
 * consequence is worth knowing before it is met as a failing assertion: the
 * waveform data covers slightly more of the timeline than the media element
 * admits to having, which is the ordinary state of real waveform files rather
 * than an artefact of these fixtures.
 */
export const TONE_DURATION = 2.0;

/** ~2 s of SMPTE colour bars at 320x180, carrying the same tone. */
export const BARS_MP4 = '/media/bars.mp4';
export const BARS_DURATION = 2.0;
export const BARS_SIZE = { width: 320, height: 180 };

/** The same colour-bars clip remuxed to HLS: four segments, no re-encode. */
export const BARS_HLS = '/media/hls/bars.m3u8';
export const BARS_HLS_SEGMENTS = 4;

/** Three cues spanning the colour-bars clip. */
export const CAPTIONS_VTT = '/media/captions.vtt';

/** `audiowaveform` output for the tone, in both on-disk formats. */
export const TONE_WAVEFORM_DAT = '/media/tone.dat';
export const TONE_WAVEFORM_JSON = '/media/tone.json';

/**
 * The local AV manifests. Each one's `summary` says what it is for and which
 * user stories it serves; this is the index, not the description.
 */
export const AV_MANIFESTS = {
    /** One Sound canvas with a duration and no width or height. */
    audio: '/media/manifests/av-audio.json',
    /** One Video canvas whose painting body ARRAY also carries the VTT. */
    video: '/media/manifests/av-video.json',
    /** One canvas, a Choice between the HLS rendition and the MP4. */
    hls: '/media/manifests/av-hls.json',
    /** Two canvases, `#t=` chapter ranges, manifest-level `auto-advance` + `repeat`. */
    structures: '/media/manifests/av-structures.json',
    /** Three canvases, one per waveform linkage shape. */
    waveform: '/media/manifests/av-waveform.json',
    /** One canvas whose duration is tiled by two `#t=`-targeted bodies. */
    composed: '/media/manifests/av-composed.json',
} as const;
