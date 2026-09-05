#!/usr/bin/env bash
#
# Regenerates every committed asset in this directory.
#
# The e2e AV suite must run with no network access, so the media it plays is
# generated rather than fetched: a synthetic tone, colour bars, an HLS rendition
# of the same clip, a caption track, and real `audiowaveform` output for the
# tone. Everything is a few KB, so it is committed — running this script should
# be necessary only when an asset's shape needs to change, and the commands
# below are the record of how each one was made.
#
# Requires `ffmpeg` (with libx264, libmp3lame and the aac encoder) and BBC
# `audiowaveform` on PATH. Neither is installed by the repo's package manager;
# on Debian/Ubuntu they are `ffmpeg` and the `.deb` from
# https://github.com/bbc/audiowaveform/releases.
#
# The waveform files MUST come from the real tool. Ticket 10's parsers are
# tested against genuine `audiowaveform` output — hand-written `.dat` or `.json`
# would make those tests assert our own reading of the format back at us.

set -euo pipefail

cd "$(dirname "$0")"

# The tone: 2 seconds of a 440 Hz sine under a slow amplitude envelope. A bare
# sine would draw a rectangle, which is an unusable fixture for waveform
# rendering and for tap-to-seek assertions — the envelope gives the peaks a
# shape a test can point at a position within.
TONE_EXPR='0.8*sin(2*PI*440*t)*(0.15+0.85*abs(sin(PI*t)))'

ffmpeg -y -f lavfi -i "aevalsrc=${TONE_EXPR}:d=2:s=44100:c=mono" \
    -c:a libmp3lame -b:a 64k tone.mp3

# Colour bars carrying the same tone. Baseline profile + yuv420p is the widest
# decoder support; `+faststart` puts the moov atom first so playback can begin
# before the whole file arrives. `-g 13` (one keyframe every 0.52 s at 25 fps)
# is what lets the HLS packaging below cut four segments by stream copy: with
# the encoder's default GOP the whole two seconds is one keyframe interval and
# the playlist comes out with a single segment.
ffmpeg -y -f lavfi -i "smptebars=size=320x180:rate=25:duration=2" \
    -f lavfi -i "aevalsrc=${TONE_EXPR}:d=2:s=44100:c=mono" \
    -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p \
    -g 13 -keyint_min 13 -sc_threshold 0 \
    -c:a aac -b:a 64k -movflags +faststart -shortest bars.mp4

# The HLS rendition — the same pictures and sound, remuxed, never re-encoded,
# so a spec that compares HLS playback against progressive playback is
# comparing identical media.
mkdir -p hls
rm -f hls/bars*.ts hls/bars.m3u8
ffmpeg -y -i bars.mp4 -c copy \
    -f hls -hls_time 0.5 -hls_list_size 0 -hls_playlist_type vod \
    -hls_segment_filename 'hls/bars%d.ts' hls/bars.m3u8

# Waveform data for the tone, in both on-disk formats, from one source clip so
# the two parsers can be asserted to produce the same peaks model. `-z 256`
# (samples per pixel) over a 2 s 44.1 kHz clip yields 347 points — enough for
# the rendering to have detail, small enough to read in a diff.
#
# Note what the tool does with `version`: the binary `.dat` is written as
# format version 1 and the `.json` as version 2. That asymmetry is genuine
# `audiowaveform` behaviour, and it is the reason peaks detection sniffs
# content rather than trusting a declared format.
#
# The peaks also cover slightly MORE than the tone: audiowaveform decodes every
# frame and sees 2.014 s (347 x 256 / 44100 — LAME pads the last frame), while a
# browser honours the gapless metadata and reports 2.0. Waveform data
# overrunning its media's reported duration is the normal case, not an artefact
# of this script.
audiowaveform -i tone.mp3 -o tone.dat -z 256 -b 16
audiowaveform -i tone.mp3 -o tone.json -z 256 -b 16

# The four VTT files are hand-written and are not regenerated here.
# `captions.vtt` is three cues over the two seconds of colour bars;
# `captions-it.vtt` is the same cues in Italian, so a fixture can offer a choice
# of languages; `no-cors-captions.vtt` is a copy of `captions.vtt` whose NAME is
# what makes the fixture server serve it without `Access-Control-Allow-Origin`
# (see `scripts/mediaFixturePlugin.mjs`); `captions-empty.vtt` is a valid file
# with no cues in it, which loads and captions nothing.
