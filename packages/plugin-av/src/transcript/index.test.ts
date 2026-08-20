/**
 * The transcript panel's behaviour, over a fake text track.
 *
 * jsdom implements the `<track>` element but not the `TextTrack` behind it, so
 * the cues here are the plain objects the real interface exposes — which is all
 * this module ever reads of one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createNotesPanel,
    createTranscriptPanel,
    type NoteEntry,
    type NotesPort,
    type TranscriptPort,
} from './index';

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
    /** The same clock, styles and catalog, for the panel's other section. */
    readonly notesPort: NotesPort;
    readonly seeks: number[];
    notes: NoteEntry[];
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
        notes: [],
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
            t: label,
        },
        get notesPort(): NotesPort {
            return {
                avState: state.port.avState,
                entries: () => state.notes,
                formatTime: state.port.formatTime,
                styles: state.port.styles,
                t: label,
            };
        },
    };
    return state;
}

function label(key: string, params?: Record<string, string>): string {
    if (key === 'av_transcript_showing') return `Showing ${params?.track}`;
    return key === 'av_notes' ? 'Notes' : 'Transcript';
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

/**
 * The notes section, over the same fake port — a second SOURCE in the panel,
 * not a second panel.
 */
describe('notes section', () => {
    let h: Harness;

    const NOTES: NoteEntry[] = [
        { id: 'a', startSeconds: 0.5, endSeconds: 1, text: 'The first note.' },
        { id: 'b', startSeconds: 1.4, endSeconds: 2, text: 'The second note.' },
    ];

    beforeEach(() => {
        document.body.replaceChildren();
        h = harness();
        h.notes = [...NOTES];
    });

    function noteButtons(): HTMLButtonElement[] {
        return [
            ...h.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="av-notes"] button',
            ),
        ];
    }

    it('lists every note in order, each with the span it covers', () => {
        createNotesPanel(h.container, h.notesPort);

        const section = h.container.querySelector('[data-testid="av-notes"]');
        expect(section?.querySelector('h3')?.textContent).toBe('Notes');
        expect(section?.querySelector('ol')?.getAttribute('aria-label')).toBe(
            'Notes',
        );
        // The span and the text both, so the accessible name of a row says
        // which moment it describes as well as what it says about it.
        expect(noteButtons().map((button) => button.textContent)).toEqual([
            '0:00–0:01The first note.',
            '0:01–0:02The second note.',
        ]);
    });

    it('lists a note that named only a start, and seeks to it', () => {
        h.notes = [{ id: 'point', startSeconds: 1.4, text: 'A moment.' }];
        createNotesPanel(h.container, h.notesPort);

        expect(noteButtons()[0].textContent).toBe('0:01A moment.');
        noteButtons()[0].click();
        expect(h.seeks).toEqual([1.4]);
    });

    it('seeks to a note’s start without ever starting playback', () => {
        createNotesPanel(h.container, h.notesPort);

        noteButtons()[1].click();

        // The port carries no `play` at all: seeking is the whole of what a
        // note can do (the epic's standing "seek, never autoplay" rule).
        expect(h.seeks).toEqual([1.4]);
        expect('play' in h.notesPort.avState).toBe(false);
    });

    /*
        Keyboard reach and activation come from the platform, which is the
        reason each row is a real `<button>` inside real list semantics rather
        than a styled `<div>` with a handler. jsdom does not implement Enter
        activating a focused button, so what is asserted is the button-ness the
        browser's own behaviour rests on, plus that activation works from the
        focused element.
    */
    it('reaches and activates every note from the keyboard', () => {
        createNotesPanel(h.container, h.notesPort);

        for (const button of noteButtons()) {
            expect(button.tagName).toBe('BUTTON');
            expect(button.type).toBe('button');
            expect(button.closest('li')?.parentElement?.tagName).toBe('OL');
        }

        noteButtons()[1].focus();
        expect(document.activeElement).toBe(noteButtons()[1]);
        (document.activeElement as HTMLButtonElement).click();
        expect(h.seeks).toEqual([1.4]);
    });

    /*
        Nothing stops a publisher spelling one IRI on two annotations, and the
        rows are keyed for the DOM's benefit rather than the manifest's: two
        rows keyed alike would reconcile into one, carrying the second's text
        and seeking the first's start.
    */
    it('keeps two notes sharing an id as two rows, each seeking its own start', () => {
        h.notes = [
            { id: 'same', startSeconds: 0.5, text: 'The first note.' },
            { id: 'same', startSeconds: 1.4, text: 'The second note.' },
        ];
        createNotesPanel(h.container, h.notesPort);

        expect(noteButtons().map((button) => button.textContent)).toEqual([
            '0:00The first note.',
            '0:01The second note.',
        ]);

        noteButtons()[0].click();
        noteButtons()[1].click();
        expect(h.seeks).toEqual([0.5, 1.4]);
    });

    it('renders no section at all while the canvas has no notes', () => {
        h.notes = [];
        const panel = createNotesPanel(h.container, h.notesPort);

        // No heading and no empty box — nothing.
        expect(
            h.container.querySelector('[data-testid="av-notes"]'),
        ).toBeNull();
        expect(h.container.textContent).toBe('');

        // And it appears once the source has something to show.
        h.notes = [...NOTES];
        panel.refresh();
        expect(noteButtons()).toHaveLength(2);
    });

    /*
        The duration decides the SHAPE of every stamp, and it lands on
        `durationchange` — after the panel may already have rendered. A list
        left in the old shape would spell a moment differently from the
        transport's own clock.
    */
    it('reformats its stamps once the canvas duration lands', () => {
        h.duration = null;
        const panel = createNotesPanel(h.container, h.notesPort);
        expect(noteButtons()[0].textContent).toBe('0:00–0:01The first note.');

        h.duration = 4000;
        panel.refresh();
        expect(noteButtons()[0].textContent).toBe(
            '0:00:00–0:00:01The first note.',
        );
    });

    /** Which rows read as current, by their position in the list. */
    function current(): number[] {
        return noteButtons().flatMap((button, index) =>
            button.getAttribute('aria-current') === 'true' ? [index] : [],
        );
    }

    it('marks the note covering the playhead and clears it on the way out', () => {
        createNotesPanel(h.container, h.notesPort);
        expect(current()).toEqual([]);

        h.time = 0.7;
        h.tick();
        expect(current()).toEqual([0]);

        // No grace period: the gap between two notes is the recording, not
        // punctuation, so a lapsed note keeps no mark (unlike a lapsed cue).
        h.time = 1.2;
        h.tick();
        expect(current()).toEqual([]);

        h.time = 1.5;
        h.tick();
        expect(current()).toEqual([1]);
    });

    it('marks every note whose span covers the playhead at once', () => {
        h.notes = [
            {
                id: 'a',
                startSeconds: 0.5,
                endSeconds: 2,
                text: 'The wide one.',
            },
            {
                id: 'b',
                startSeconds: 1,
                endSeconds: 1.5,
                text: 'The inner one.',
            },
            {
                id: 'c',
                startSeconds: 1.8,
                endSeconds: 2,
                text: 'The late one.',
            },
        ];
        createNotesPanel(h.container, h.notesPort);

        h.time = 1.2;
        h.tick();
        expect(current()).toEqual([0, 1]);
    });

    it('never marks a note that named only a start', () => {
        h.notes = [{ id: 'point', startSeconds: 1, text: 'A moment.' }];
        createNotesPanel(h.container, h.notesPort);

        for (const time of [1, 1.000_001, 2]) {
            h.time = time;
            h.tick();
            expect(current()).toEqual([]);
        }
    });

    /*
        Half-open at the end, so the boundary belongs to the note starting
        there and two adjacent notes never both light up on one frame.
    */
    it('marks exactly one note at the boundary between two adjacent spans', () => {
        h.notes = [
            { id: 'a', startSeconds: 0, endSeconds: 1, text: 'The first.' },
            { id: 'b', startSeconds: 1, endSeconds: 2, text: 'The second.' },
        ];
        createNotesPanel(h.container, h.notesPort);

        h.time = 1;
        h.tick();
        expect(current()).toEqual([1]);
    });

    it('shows the transcript and the notes as two labelled sections', () => {
        createTranscriptPanel(h.container, h.port);
        createNotesPanel(h.container, h.notesPort);

        const lists = [...h.container.querySelectorAll('ol')];
        expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual([
            'Transcript',
            'Notes',
        ]);
        // The transcript first: the machine-timed words, then the editor's.
        expect(lists[0].dataset.testid).toBe('av-transcript-cues');
        expect(lists[1].dataset.testid).toBe('av-notes-list');
        expect(noteButtons()).toHaveLength(2);
    });

    it('releases its DOM, its subscription and its styles', () => {
        const release = vi.fn();
        const panel = createNotesPanel(h.container, {
            ...h.notesPort,
            styles: { install: () => release },
        });

        panel.destroy();

        expect(
            h.container.querySelector('[data-testid="av-notes"]'),
        ).toBeNull();
        expect(release).toHaveBeenCalledTimes(1);
        // A frame after destruction reaches nothing.
        h.time = 0.7;
        expect(() => h.tick()).not.toThrow();
        // Load-bearing: a leaked frame listener would re-enter `render()`,
        // find the detached root and rebuild and re-append the section, so a
        // still-null query is what proves the subscription was dropped.
        expect(
            h.container.querySelector('[data-testid="av-notes"]'),
        ).toBeNull();
    });
});
