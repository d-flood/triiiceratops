import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active
 * locale**): ships with the plugin rather than living in core's catalogs, so
 * core carries no plugin keys. `en` is the required fallback; a missing key
 * resolves to `en` and then to the key itself.
 *
 * Every string a reader or a screen reader meets is here — the accessibility
 * contract is that the controls announce in the viewer's active locale, which a
 * hard-coded label cannot do.
 */
export const catalog: LocaleCatalog = {
    en: {
        av_title: 'Audio & Video',
        av_cannot_play: 'This media cannot be played here.',
        av_transport: 'Playback controls',
        av_play: 'Play',
        av_pause: 'Pause',
        av_seek: 'Seek',
        av_mute: 'Mute',
        av_unmute: 'Unmute',
        av_volume: 'Volume',
        // `{current}` and `{total}` are already-formatted clock readings, so a
        // translation reorders them rather than reformatting them.
        av_position: '{current} of {total}',
        av_captions: 'Captions',
        av_captions_off: 'Off',
        // The name a track that declares neither a label nor a language is
        // listed under. Every other name in the list is authored content.
        av_captions_track: 'Captions',
        // The transcript panel. `{track}` is the track's own authored name, so
        // a translation reorders the sentence around it rather than naming it.
        av_transcript: 'Transcript',
        av_transcript_showing: 'Showing {track}',
        // An untimed transcript linked from the canvas (cookbook 0017), which
        // arrives over the network and may not arrive at all.
        av_transcript_loading: 'Loading transcript…',
        av_transcript_failed: 'This transcript could not be loaded here.',
        av_transcript_open: 'Open the transcript file',
        // The panel's second section: the annotations timed against moments in
        // the recording — the manifest's own commentary, and any user
        // annotation the viewer holds for the canvas (cookbook 0103).
        av_notes: 'Notes',
        // What the transport's panel control is called when the canvas offers
        // notes but no transcript, so a button never names something the panel
        // does not hold. A separate key from `av_notes` although English spells
        // them alike: one names a control, the other heads a section, and a
        // translation is free to distinguish them.
        av_notes_panel: 'Notes',
    },
};
