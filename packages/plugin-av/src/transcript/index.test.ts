/**
 * The transcript panel's behaviour, over a fake text track.
 *
 * jsdom implements the `<track>` element but not the `TextTrack` behind it, so
 * the cues here are the plain objects the real interface exposes — which is all
 * this module ever reads of one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranscriptPanel, type TranscriptPort } from './index';

function cue(startTime: number, endTime: number, text: string): VTTCue {
    return { startTime, endTime, text } as VTTCue;
}

const CUES = [
    cue(0, 0.7, 'Colour bars, first third.'),
    cue(0.7, 1.4, 'Colour bars, second third.'),
    cue(1.4, 2, 'Colour bars, last third.'),
];

interface Harness {
    readonly container: HTMLElement;
    readonly port: TranscriptPort;
    readonly seeks: number[];
    tick(): void;
    time: number;
    duration: number | null;
    offset: number;
    label: string;
    cues: VTTCue[] | null;
    /** Bumped to hand the panel a DIFFERENT `TextTrack` for the same cues —
     * what selecting another language, or crossing a segment seam, does. */
    trackId: number;
}

function harness(): Harness {
    const container = document.createElement('div');
    document.body.append(container);

    const listeners = new Set<() => void>();
    const seeks: number[] = [];
    const tracks = new Map<number, TextTrack>();

    const state: Harness = {
        container,
        seeks,
        time: 0,
        duration: 2,
        offset: 0,
        label: 'English (en)',
        trackId: 0,
        cues: [...CUES] as VTTCue[] | null,
        tick(): void {
            for (const listener of [...listeners]) listener();
        },
        port: {
            avState: {
                get currentTime(): number {
                    return state.time;
                },
                get duration(): number | null {
                    return state.duration;
                },
                seek: (seconds: number) => void seeks.push(seconds),
                subscribeFrame: (callback: () => void) => {
                    listeners.add(callback);
                    return () => void listeners.delete(callback);
                },
            },
            source: () => {
                if (!state.cues)
                    return { track: null, offset: state.offset, label: '' };
                // Stable per id, so an unchanged track is the SAME object and
                // the panel can tell "still this track" from "another track".
                let track = tracks.get(state.trackId);
                if (!track) {
                    track = {} as TextTrack;
                    tracks.set(state.trackId, track);
                }
                Object.defineProperty(track, 'cues', {
                    get: () => state.cues as unknown as TextTrackCueList,
                    configurable: true,
                });
                return { track, offset: state.offset, label: state.label };
            },
            // The real formatter's rule: the TOTAL decides the shape, so every
            // stamp in one list has the same one (ticket 08).
            formatTime: (seconds: number, total: number | null) => {
                const whole = Math.floor(seconds);
                const mmss = `${Math.floor((whole % 3600) / 60)}:${String(whole % 60).padStart(2, '0')}`;
                return (total ?? seconds) >= 3600
                    ? `${Math.floor(whole / 3600)}:${mmss.padStart(5, '0')}`
                    : mmss;
            },
            styles: { install: () => () => {} },
            t: (key: string, params?: Record<string, string>) =>
                key === 'av_transcript_showing'
                    ? `Showing ${params?.track}`
                    : 'Transcript',
        },
    };
    return state;
}

function cueButtons(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll('button')];
}

describe('transcript panel', () => {
    let h: Harness;

    beforeEach(() => {
        document.body.replaceChildren();
        h = harness();
    });

    it('lists every cue as a button inside a real list', () => {
        createTranscriptPanel(h.container, h.port);

        const list = h.container.querySelector('ol');
        expect(list?.getAttribute('aria-label')).toBe('Transcript');
        expect(list?.querySelectorAll('li')).toHaveLength(3);
        expect(cueButtons(h.container).map((b) => b.textContent)).toEqual([
            '0:00Colour bars, first third.',
            '0:00Colour bars, second third.',
            '0:01Colour bars, last third.',
        ]);
    });

    it('says which track it is reading', () => {
        createTranscriptPanel(h.container, h.port);
        expect(
            h.container.querySelector('[data-testid="av-transcript-track"]')
                ?.textContent,
        ).toBe('Showing English (en)');
    });

    it('seeks to a cue without ever starting playback', () => {
        createTranscriptPanel(h.container, h.port);

        cueButtons(h.container)[1].click();

        // The port carries no `play` at all: seeking is the whole of what a cue
        // can do (the epic's standing "seek, never autoplay" rule).
        expect(h.seeks).toEqual([0.7]);
        expect('play' in h.port.avState).toBe(false);
    });

    it('marks the cue covering the playhead as it advances', () => {
        createTranscriptPanel(h.container, h.port);
        const current = (): number =>
            cueButtons(h.container).findIndex(
                (button) => button.getAttribute('aria-current') === 'true',
            );

        expect(current()).toBe(0);

        h.time = 1;
        h.tick();
        expect(current()).toBe(1);

        h.time = 1.6;
        h.tick();
        expect(current()).toBe(2);
    });

    it('shifts cue times by the canvas-time offset of a composed segment', () => {
        h.offset = 10;
        createTranscriptPanel(h.container, h.port);

        cueButtons(h.container)[1].click();
        expect(h.seeks).toEqual([10.7]);

        h.time = 10.1;
        h.tick();
        expect(cueButtons(h.container)[0].getAttribute('aria-current')).toBe(
            'true',
        );
    });

    it('rebuilds when the segment offset moves', () => {
        createTranscriptPanel(h.container, h.port);
        h.offset = 10;
        h.tick();

        cueButtons(h.container)[0].click();
        expect(h.seeks).toEqual([10]);
    });

    it('stops following the playhead once the reader scrolls away', () => {
        createTranscriptPanel(h.container, h.port);
        const list = h.container.querySelector('ol') as HTMLElement;
        const scrolls: number[] = [];
        // jsdom lays nothing out, so the scroll the panel performs is observed
        // through the property it writes rather than through geometry.
        Object.defineProperty(list, 'scrollTop', {
            get: () => scrolls[scrolls.length - 1] ?? 0,
            set: (value: number) => void scrolls.push(value),
            configurable: true,
        });

        h.time = 1;
        h.tick();
        const followed = scrolls.length;
        expect(followed).toBeGreaterThan(0);

        // A scroll the panel did not write is the reader's.
        scrolls.push(999);
        list.dispatchEvent(new Event('scroll'));

        h.time = 1.6;
        h.tick();
        expect(scrolls).toHaveLength(followed + 1);

        // Activating a cue is an explicit "take me there", so following resumes.
        cueButtons(h.container)[0].click();
        h.time = 1;
        h.tick();
        expect(scrolls.length).toBeGreaterThan(followed + 1);
    });

    /**
     * The composed-canvas seam, from the panel's side: `transcriptSource`
     * hands over a different track, a different shift and a different name all
     * at once, and none of it arrives as a remount.
     */
    it('follows the eligible track across a composed segment seam', () => {
        createTranscriptPanel(h.container, h.port);
        expect(
            h.container.querySelector('[data-testid="av-transcript-track"]')
                ?.textContent,
        ).toBe('Showing English (en)');

        // The seam: segment two's track is windowed in, with its own cues, its
        // own name, and the canvas-time shift of a segment starting at 2s.
        h.trackId = 1;
        h.offset = 2;
        h.label = 'Italiano (it)';
        h.cues = [
            cue(0, 0.7, 'Barre colorate, primo terzo.'),
            cue(0.7, 1.4, 'Barre colorate, secondo terzo.'),
            cue(1.4, 2, 'Barre colorate, ultimo terzo.'),
        ];
        h.tick();

        expect(
            h.container.querySelector('[data-testid="av-transcript-track"]')
                ?.textContent,
        ).toBe('Showing Italiano (it)');
        expect(cueButtons(h.container)[0].textContent).toBe(
            '0:02Barre colorate, primo terzo.',
        );

        // Cue times are canvas time on the far side of the seam.
        cueButtons(h.container)[1].click();
        expect(h.seeks).toEqual([2.7]);
    });

    /**
     * A track swap that changes NEITHER the cue count nor the offset — picking
     * another caption language on an ordinary canvas — is still a new list.
     */
    it('rebuilds when the track changes but its shape does not', () => {
        createTranscriptPanel(h.container, h.port);

        h.trackId = 1;
        h.label = 'Italiano (it)';
        h.cues = [
            cue(0, 0.7, 'Barre colorate, primo terzo.'),
            cue(0.7, 1.4, 'Barre colorate, secondo terzo.'),
            cue(1.4, 2, 'Barre colorate, ultimo terzo.'),
        ];
        h.tick();

        expect(cueButtons(h.container)[0].textContent).toBe(
            '0:00Barre colorate, primo terzo.',
        );
    });

    it('refreshes on demand, for a paused canvas running no frame cadence', () => {
        const panel = createTranscriptPanel(h.container, h.port);

        h.trackId = 1;
        h.label = 'Italiano (it)';
        h.cues = [cue(0, 0.7, 'Barre colorate, primo terzo.')];
        panel.refresh();

        expect(cueButtons(h.container)).toHaveLength(1);
        expect(
            h.container.querySelector('[data-testid="av-transcript-track"]')
                ?.textContent,
        ).toBe('Showing Italiano (it)');
    });

    /**
     * The panel's OWN scrolling must never read as the reader's. A rebuild
     * that emptied the list would reset `scrollTop`, and the handler would
     * latch the follow off for the rest of the session.
     */
    it('keeps following the playhead across a rebuild', () => {
        createTranscriptPanel(h.container, h.port);
        const list = h.container.querySelector('ol') as HTMLElement;

        // jsdom lays nothing out, and with every offset zero the panel's own
        // scroll position is zero too — which cannot tell a reset apart from a
        // reader. So the list is given a real geometry: a 100px window over
        // 100px cues.
        let top = 0;
        const scrolls: number[] = [];
        Object.defineProperty(list, 'scrollTop', {
            get: () => top,
            set: (value: number) => {
                top = value;
                scrolls.push(value);
            },
            configurable: true,
        });
        Object.defineProperty(list, 'clientHeight', {
            get: () => 100,
            configurable: true,
        });
        Object.defineProperty(list, 'scrollHeight', {
            get: () => 100 * cueButtons(h.container).length,
            configurable: true,
        });
        for (const proto of [HTMLButtonElement.prototype]) {
            Object.defineProperty(proto, 'offsetHeight', {
                get: () => 100,
                configurable: true,
            });
            Object.defineProperty(proto, 'offsetTop', {
                get(this: HTMLElement) {
                    return 100 * Number(this.dataset.cueIndex ?? 0);
                },
                configurable: true,
            });
        }

        // Emptying the list is what a browser resets `scrollTop` on, so that
        // is what the defect this pins would do here.
        vi.spyOn(list, 'replaceChildren').mockImplementation(function (
            this: HTMLElement,
            ...nodes: (Node | string)[]
        ) {
            top = 0;
            HTMLElement.prototype.replaceChildren.apply(this, nodes);
        } as typeof list.replaceChildren);

        h.time = 1;
        h.tick();
        expect(top).toBe(100);

        // A rebuild during a SILENCE, with no cue active to highlight. That is
        // the case with no scroll of its own to re-anchor on, so a list that
        // reset `scrollTop` here would leave the stale position standing and
        // the next scroll event would read as the reader's.
        h.time = 5;
        h.trackId = 1;
        h.cues = [...CUES, cue(8, 8.7, 'After a long pause.')];
        h.tick();
        expect(
            cueButtons(h.container).some((b) => b.hasAttribute('aria-current')),
        ).toBe(false);

        // The browser delivers the scroll event AFTER the rebuild, whatever
        // the rebuild left `scrollTop` at.
        list.dispatchEvent(new Event('scroll'));

        // Still following: the highlight moving must still scroll the list.
        const before = scrolls.length;
        h.time = 8.2;
        h.tick();
        expect(scrolls.length).toBeGreaterThan(before);
        // The fourth cue, scrolled to the bottom of a 400px list.
        expect(top).toBe(300);
    });

    /**
     * A keyboard reader's place survives a rebuild. Losing it would drop focus
     * to `<body>`, leaving them to tab in from the top of the page mid-
     * playback — in the panel whose whole purpose is to be the accessible path.
     */
    it('keeps keyboard focus on a cue across a rebuild', () => {
        createTranscriptPanel(h.container, h.port);

        cueButtons(h.container)[1].focus();
        expect(document.activeElement).toBe(cueButtons(h.container)[1]);

        h.trackId = 1;
        h.offset = 2;
        h.tick();

        expect(document.activeElement).toBe(cueButtons(h.container)[1]);
        expect(document.activeElement).not.toBe(document.body);
    });

    it('moves focus to the last surviving cue when the list shortens', () => {
        createTranscriptPanel(h.container, h.port);

        cueButtons(h.container)[2].focus();
        h.trackId = 1;
        h.cues = [cue(0, 0.7, 'Only one cue now.')];
        h.tick();

        const buttons = cueButtons(h.container);
        expect(buttons).toHaveLength(1);
        expect(document.activeElement).toBe(buttons[0]);
    });

    /**
     * Ticket 08's rule for the transport, which the panel is a second reader
     * of: the TOTAL decides the shape, so a stamp does not grow an hours field
     * partway down the list.
     */
    it('shapes every timestamp against the canvas duration', () => {
        h.duration = 3700;
        h.cues = [
            cue(0, 1, 'The first minute.'),
            cue(3650, 3660, 'Past the hour.'),
        ];
        createTranscriptPanel(h.container, h.port);

        expect(cueButtons(h.container).map((b) => b.textContent)).toEqual([
            '0:00:00The first minute.',
            '1:00:50Past the hour.',
        ]);
    });

    /**
     * The gap clause at {@link GAP_GRACE}: a short silence is punctuation and
     * keeps the reader's place; a long one is the recording genuinely saying
     * nothing, and a highlight left standing there would be a lie.
     */
    it('holds the highlight through a gap shorter than the grace', () => {
        h.cues = [cue(0, 1, 'Before the pause.'), cue(10, 11, 'After it.')];
        createTranscriptPanel(h.container, h.port);

        h.time = 1.9;
        h.tick();
        expect(cueButtons(h.container)[0].getAttribute('aria-current')).toBe(
            'true',
        );
    });

    it('drops the highlight once a gap outlasts the grace', () => {
        h.cues = [cue(0, 1, 'Before the pause.'), cue(10, 11, 'After it.')];
        createTranscriptPanel(h.container, h.port);

        h.time = 2.5;
        h.tick();
        expect(
            cueButtons(h.container).filter((button) =>
                button.hasAttribute('aria-current'),
            ),
        ).toHaveLength(0);

        // And picks it up again at the next cue.
        h.time = 10.2;
        h.tick();
        expect(cueButtons(h.container)[1].getAttribute('aria-current')).toBe(
            'true',
        );
    });

    it('releases its DOM, its subscription and its styles', () => {
        const release = vi.fn();
        const port = { ...h.port, styles: { install: () => release } };
        const panel = createTranscriptPanel(h.container, port);

        panel.destroy();

        expect(h.container.querySelector('ol')).toBeNull();
        expect(release).toHaveBeenCalledTimes(1);
        // A tick after destruction reaches nothing.
        expect(() => h.tick()).not.toThrow();
    });
});
