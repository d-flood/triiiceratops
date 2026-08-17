/**
 * The **transcript panel**: a claimed canvas's WebVTT cues as readable,
 * navigable text.
 *
 * A lazy chunk, and that is a budget decision rather than an architectural one:
 * the competitive pair budget (`scripts/size-check.mjs`) had 560 gzip to spare
 * when this was written, and a list with real semantics, keyboard operation and
 * its own stylesheet does not fit in it. What stays eager is only the question
 * "does the current canvas offer a transcript at all" — which `mediaStage`
 * already answers with its loaded-track set — plus the `await import()` in
 * `transcriptLink.ts`.
 *
 * Imperative DOM rather than a Svelte component, and that IS architectural: the
 * lazy chunks are built with nothing external (see `vite.config.ts`), so a
 * component here would bundle a second Svelte runtime — the one thing this
 * plugin's packaging exists to avoid, and a build failure under
 * `check-shared-runtime.mjs`.
 *
 * The port below carries VALUES rather than modules. A chunk is built
 * self-contained (`vite.config.ts`), so importing a shared module from the
 * eager side does not share it — in the ESM build it splits both entry and
 * chunk around a third file and the dist stops being the one-entry shape its
 * gates check for. Anything the entry already has (its clock formatter, the
 * track's list name) is therefore handed over rather than imported.
 *
 * Everything crossing this seam is in CANVAS time. A cue's own times are in the
 * clock of the media file it was authored beside, which on a temporally
 * composed canvas is one segment's; the offset from
 * {@link TranscriptPort.source} carries the shift, and nothing here knows what
 * a segment is.
 */

/**
 * What the panel needs from the eager side of the plugin.
 *
 * Deliberately shaped out of things the entry ALREADY holds — the published
 * state, the SDK's style and locale services, the transport's clock formatter —
 * rather than out of per-member adapters. Every adapter the entry has to write
 * is eager weight, and the pair budget is measured in hundreds of bytes.
 */
export interface TranscriptPort {
    /**
     * The playhead and the seek, in CANVAS time, on the frame cadence the
     * active-cue highlight rides. Seeking never starts playback — the epic's
     * standing rule that navigation seeks and consent plays.
     */
    readonly avState: {
        readonly currentTime: number;
        /**
         * The canvas's duration, which decides the SHAPE of every timestamp
         * (ticket 08's rule for the transport): a list whose stamps grew an
         * hours field partway down would be unreadable as a column.
         */
        readonly duration: number | null;
        seek(seconds: number): void;
        subscribeFrame(callback: () => void): () => void;
    };
    /**
     * The text track whose cues are listed, the canvas time they must be
     * shifted by, and the track's name as the captions list gives it — all read
     * live, because a track settles on the network's schedule and on a
     * temporally composed canvas all three change at a segment seam.
     */
    source(): { track: TextTrack | null; offset: number; label: string };
    /** The entry's own clock formatter, so this chunk carries no second one. */
    formatTime(seconds: number, total: number | null): string;
    /** The SDK's root-aware, nonce-aware style service. */
    readonly styles: { install(css: string, id: string): () => void };
    /** The plugin's locale catalog. */
    t(key: string, params?: Record<string, string>): string;
}

export interface TranscriptPanel {
    /**
     * Re-read the source now, outside the frame cadence.
     *
     * The cadence runs only while something is playing, so everything that
     * changes the transcript of a PAUSED canvas — selecting another caption
     * language, a track settling off the network — reaches the panel through
     * here and nowhere else.
     */
    refresh(): void;
    /** Release the DOM, the subscription and the stylesheet. */
    destroy(): void;
}

/** One cue as the list renders it, in canvas time. */
interface TranscriptCue {
    readonly start: number;
    readonly end: number;
    readonly text: string;
}

/**
 * A cue's text without its WebVTT markup.
 *
 * Cue payloads may carry timestamp, voice and styling tags (`<v Ann>`, `<i>`);
 * they are written into `textContent`, so they would otherwise read as literal
 * angle brackets. Stripping is not sanitization — nothing here parses HTML.
 */
function plainText(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
}

/** The track's cues in canvas time, in start order. */
function readCues(track: TextTrack | null, offset: number): TranscriptCue[] {
    const cues = track?.cues;
    if (!cues) return [];

    const list: TranscriptCue[] = [];
    for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index] as VTTCue;
        const text = plainText(cue.text ?? '');
        if (text) {
            list.push({
                start: cue.startTime + offset,
                end: cue.endTime + offset,
                text,
            });
        }
    }
    return list;
}

/**
 * The cue covering a moment, or the last one before it.
 *
 * The second half matters as much as the first: VTT files leave short gaps
 * between cues — breaths, sentence boundaries, the pause an author wrote the
 * next cue after — and a reader whose highlight vanished in every one of them
 * would lose their place in the text several times a minute.
 *
 * {@link GAP_GRACE} is how long a lapsed cue keeps the highlight. It is a
 * judgement about speech, not a tolerance: under it the silence is punctuation
 * within a passage and the reader's place is still the cue just spoken; over
 * it the recording has genuinely stopped saying anything — applause, a scene
 * change, the run-out after the last cue — and a highlight left standing there
 * would be claiming words are being spoken that are not. Clearing it is also
 * what lets the panel show NO current cue, which is the honest state during a
 * long silence.
 */
const GAP_GRACE = 1;

function activeIndex(cues: readonly TranscriptCue[], time: number): number {
    let found = -1;
    for (let index = 0; index < cues.length; index += 1) {
        if (cues[index].start > time + 0.001) break;
        found = index;
    }
    if (found >= 0 && cues[found].end < time - GAP_GRACE) return -1;
    return found;
}

const CSS = `
.tri-av-transcript {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 0.25rem;
}
.tri-av-transcript-track {
    margin: 0;
    font-size: 0.8125rem;
    opacity: 0.75;
}
.tri-av-transcript-cues {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    /* Bounded so the list scrolls inside the panel instead of pushing the
       panel's own chrome off screen; tall enough to show several cues at the
       narrow, short viewports the mobile layout below is for. */
    max-height: 22rem;
}
.tri-av-transcript-cue {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 0;
    border-radius: var(--tri-radius, 4px);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    /* A touch target a finger can hit, per the repo's mobile rule. */
    min-height: 44px;
}
.tri-av-transcript-cue:hover {
    background: var(--tri-hover-bg, rgba(127, 127, 127, 0.18));
}
.tri-av-transcript-cue:focus-visible {
    outline: 2px solid var(--tri-focus-ring, currentColor);
    outline-offset: -2px;
}
.tri-av-transcript-cue[aria-current='true'] {
    background: var(--tri-selected-bg, rgba(127, 127, 127, 0.28));
    font-weight: 600;
}
.tri-av-transcript-time {
    flex: none;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}
@media (max-width: 480px) {
    .tri-av-transcript-cues {
        max-height: 14rem;
    }
    .tri-av-transcript-time {
        /* The clock is redundant beside the text on a phone-width panel, and
           it costs the cue text a third of the line. Still in the accessible
           name, because it is how a screen-reader user tells two cues apart. */
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
    }
}
`;

/**
 * What the untimed panel needs from the eager side.
 *
 * A different port from {@link TranscriptPort} rather than a widening of it,
 * because the two panels share no input: this one has a file and no clock, that
 * one has a clock and no file. Nothing here reads playback state, which is the
 * whole difference between a transcript and a cue list.
 */
export interface TextTranscriptPort {
    /** The transcript file, as the canvas linked it. */
    readonly url: string;
    /** The publisher's name for it, or `''` to fall back to the generic one. */
    readonly label: string;
    /** The SDK's root-aware, nonce-aware style service. */
    readonly styles: { install(css: string, id: string): () => void };
    /** The plugin's locale catalog. */
    t(key: string, params?: Record<string, string>): string;
    /**
     * How the bytes are fetched. Injected so the panel's own tests need no
     * network, and so a host that must route requests through its own transport
     * has somewhere to do it. Defaults to `fetch`.
     */
    fetchText?(url: string): Promise<string>;
}

const TEXT_CSS = `
.tri-av-transcript-text {
    margin: 0;
    max-height: 22rem;
    overflow-y: auto;
    font-size: 0.8125rem;
    line-height: 1.5;
}
.tri-av-transcript-text p {
    margin: 0 0 0.75em;
}
.tri-av-transcript-text p:last-child {
    margin-bottom: 0;
}
@media (max-width: 480px) {
    .tri-av-transcript-text {
        max-height: 14rem;
    }
}
`;

/**
 * A plain-text transcript's paragraphs.
 *
 * Two shapes are in the wild and they need opposite treatment. Prose transcripts
 * are hard-wrapped at some column the author chose, so a single newline inside a
 * paragraph is a typesetting artifact and joining on a space is what restores
 * the sentence; blank lines are the real paragraph breaks. Interview and
 * oral-history transcripts, by contrast, are often one speaker turn per line
 * with no blank lines anywhere, and joining those would run every speaker
 * together into a single block.
 *
 * The absence of any blank line is what tells the two apart: a file with none
 * cannot be using them as breaks, so its lines ARE its paragraphs.
 */
function paragraphs(text: string): string[] {
    const normalized = text.replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];

    const lines = (block: string): string[] =>
        block
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

    const blocks = normalized.split(/\n[ \t]*\n+/);
    if (blocks.length === 1) return lines(normalized);
    return blocks.map((block) => lines(block).join(' ')).filter(Boolean);
}

/**
 * Render an untimed transcript file into `container`.
 *
 * The counterpart to {@link createTranscriptPanel} for the other half of the
 * IIIF transcript contract (cookbook 0017): one whole transcript linked from the
 * canvas's `rendering`, with no cue times to sync against. There is deliberately
 * no highlight, no click-to-seek and no scroll-follow — the file carries no
 * timing, so every one of those would have to be invented, and a transcript that
 * pretended to follow the playhead while guessing at it is worse than one that
 * plainly does not.
 *
 * A fetch that fails leaves the reader a link to the file rather than an empty
 * panel. That path is not an edge case: these files are routinely cross-origin
 * (the cookbook's own is), and CORS is not something a publisher of a transcript
 * has any reason to have thought about.
 */
export function createTextTranscriptPanel(
    container: HTMLElement,
    port: TextTranscriptPort,
): TranscriptPanel {
    const releaseStyles = port.styles.install(TEXT_CSS, 'transcript-text');
    const name = port.label || port.t('av_transcript');

    const root = document.createElement('div');
    root.className = 'tri-av-transcript';
    root.dataset.testid = 'av-transcript';

    const showing = document.createElement('p');
    showing.className = 'tri-av-transcript-track';
    showing.dataset.testid = 'av-transcript-track';
    showing.textContent = name;

    const body = document.createElement('div');
    body.className = 'tri-av-transcript-text';
    body.dataset.testid = 'av-transcript-text';
    // A named region, so a screen-reader user can reach the transcript as a
    // landmark instead of arrowing to it through the whole panel.
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', name);
    // The text arrives over the network, so the region is a live one: a reader
    // who is already inside it when the bytes land is told, rather than left
    // sitting in what still reads as an empty box.
    body.setAttribute('aria-live', 'polite');
    body.setAttribute('aria-busy', 'true');

    const status = document.createElement('p');
    status.textContent = port.t('av_transcript_loading');
    body.append(status);

    root.append(showing, body);
    container.append(root);

    /** Set by `destroy`, so a fetch that settles afterwards writes nothing. */
    let live = true;

    function fill(text: string): void {
        const blocks = paragraphs(text);
        // A file that fetched but holds nothing is not a transcript a reader can
        // read, and an empty panel would not say so.
        if (!blocks.length) {
            fail();
            return;
        }
        body.replaceChildren(
            ...blocks.map((block) => {
                const paragraph = document.createElement('p');
                paragraph.textContent = block;
                return paragraph;
            }),
        );
        body.setAttribute('aria-busy', 'false');
    }

    function fail(): void {
        const message = document.createElement('p');
        message.textContent = port.t('av_transcript_failed');

        const link = document.createElement('a');
        link.href = port.url;
        link.target = '_blank';
        // `noreferrer` implies `noopener`; both are named because the
        // vulnerability being closed is the opened page reaching back through
        // `window.opener`, and a reader of this line should not have to know
        // that one keyword covers it.
        link.rel = 'noreferrer noopener';
        link.textContent = port.t('av_transcript_open');

        body.replaceChildren(message, link);
        body.setAttribute('aria-busy', 'false');
    }

    const read = port.fetchText ?? defaultFetchText;
    void read(port.url).then(
        (text) => {
            if (live) fill(text);
        },
        () => {
            if (live) fail();
        },
    );

    return {
        /**
         * Nothing to re-read: this panel has no source that changes. It exists
         * because the manager holds both panels through one handle, and a
         * caller that had to know which kind it was holding would be the seam
         * leaking back out.
         */
        refresh(): void {},
        destroy(): void {
            live = false;
            root.remove();
            releaseStyles();
        },
    };
}

async function defaultFetchText(url: string): Promise<string> {
    const response = await fetch(url);
    // A 404 body is a page of HTML, and `fetch` resolves for it. Rendering that
    // as the transcript is the failure this check exists to turn into the link.
    if (!response.ok) throw new Error(String(response.status));
    return response.text();
}

/**
 * Render the transcript into `container` and keep it in step with playback.
 *
 * The list is real list semantics with a real button per cue, because the panel
 * is the accessible path to the text in its own right — not a decoration over
 * captions a sound recording never draws.
 */
export function createTranscriptPanel(
    container: HTMLElement,
    port: TranscriptPort,
): TranscriptPanel {
    const releaseStyles = port.styles.install(CSS, 'transcript');

    const root = document.createElement('div');
    root.className = 'tri-av-transcript';
    root.dataset.testid = 'av-transcript';

    const showing = document.createElement('p');
    showing.className = 'tri-av-transcript-track';
    showing.dataset.testid = 'av-transcript-track';

    const list = document.createElement('ol');
    list.className = 'tri-av-transcript-cues';
    list.dataset.testid = 'av-transcript-cues';
    list.setAttribute('aria-label', port.t('av_transcript'));

    root.append(showing, list);
    container.append(root);

    let cues: TranscriptCue[] = [];
    const buttons: HTMLButtonElement[] = [];
    let renderedOffset = Number.NaN;
    /** How many cues the track carried when the list was last built — not
     * `cues.length`, which drops the empty ones. */
    let renderedCount = -1;
    /** The track the list was last built from. Identity, not URL: selecting
     * another language swaps the track while the cue count and the offset can
     * both stay exactly as they were. */
    let renderedTrack: TextTrack | null = null;
    let renderedLabel = '';
    let current = -1;

    /**
     * Whether the list still follows the playhead.
     *
     * A reader who has scrolled away is reading, and yanking them back on the
     * next cue boundary is the one thing a transcript UI must not do. Scrolling
     * away stops the follow; activating a cue — an explicit "take me there" —
     * starts it again.
     */
    let following = true;
    /** What the last programmatic scroll left `scrollTop` at, so the handler
     * can tell its own writes from the reader's. */
    let scrolledTo = 0;

    list.addEventListener('scroll', () => {
        if (Math.abs(list.scrollTop - scrolledTo) > 2) following = false;
    });

    /**
     * Rebuild the list for a new track, offset or cue count.
     *
     * Nodes are REUSED rather than replaced, and that is a correctness
     * requirement rather than a performance one. Emptying the list would reset
     * `scrollTop`, which the scroll handler above would read as the reader
     * having scrolled away and silently latch the follow off; and it would
     * destroy the focused button, dropping DOM focus to `<body>` so that a
     * keyboard reader mid-playback could only get back by tabbing in from the
     * top of the page. A cue button at index `i` always shows cue `i`, so
     * rewriting its two spans is the whole of the update.
     */
    function render(
        track: TextTrack | null,
        offset: number,
        count: number,
        label: string,
    ): void {
        cues = readCues(track, offset);
        renderedTrack = track;
        renderedOffset = offset;
        renderedCount = count;
        current = -1;

        if (label !== renderedLabel) {
            renderedLabel = label;
            showing.textContent = port.t('av_transcript_showing', {
                track: label,
            });
        }

        while (buttons.length < cues.length) {
            const index = buttons.length;
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tri-av-transcript-cue';
            button.dataset.cueIndex = String(index);

            const time = document.createElement('span');
            time.className = 'tri-av-transcript-time';
            button.append(time, document.createElement('span'));
            button.addEventListener('click', () => {
                const cue = cues[index];
                if (!cue) return;
                following = true;
                port.avState.seek(cue.start);
                highlight(index);
            });
            item.append(button);
            list.append(item);
            buttons.push(button);
        }

        // A shorter track can strand focus on a button about to be removed;
        // move it to the last surviving cue rather than letting it fall to
        // `<body>`.
        const focused = buttons.indexOf(
            (root.getRootNode() as Document | ShadowRoot)
                .activeElement as HTMLButtonElement,
        );
        if (focused >= cues.length && cues.length > 0)
            buttons[cues.length - 1].focus();

        while (buttons.length > cues.length)
            (buttons.pop() as HTMLButtonElement).parentElement?.remove();

        const total = port.avState.duration;
        cues.forEach((cue, index) => {
            const button = buttons[index];
            button.removeAttribute('aria-current');
            (button.firstElementChild as HTMLElement).textContent =
                port.formatTime(cue.start, total);
            (button.lastElementChild as HTMLElement).textContent = cue.text;
        });

        // The rebuild may have changed the list's height and so clamped
        // `scrollTop`. That is the panel's own doing, never the reader's, so
        // the follow's reference point moves with it.
        scrolledTo = list.scrollTop;
    }

    /** Mark one cue as the playhead's and, while following, scroll it in. */
    function highlight(index: number): void {
        if (index === current) return;
        buttons[current]?.removeAttribute('aria-current');
        current = index;
        const button = buttons[index];
        if (!button) return;
        button.setAttribute('aria-current', 'true');
        if (!following) return;

        // `scrollTop` rather than `scrollIntoView`: the latter scrolls every
        // scrollable ancestor, which would drag the whole plugin panel — and
        // sometimes the page — around whenever a cue changed.
        const centred =
            button.offsetTop - (list.clientHeight - button.offsetHeight) / 2;
        scrolledTo = Math.max(
            0,
            Math.min(centred, list.scrollHeight - list.clientHeight),
        );
        list.scrollTop = scrolledTo;
    }

    /**
     * One tick: pick up cues that have only just parsed, a segment seam or a
     * caption selection that changed which track is eligible, and the
     * playhead.
     */
    function sync(): void {
        const { track, offset: raw, label } = port.source();
        const offset = Math.round(raw * 1000) / 1000;
        const parsed = track?.cues?.length ?? 0;
        if (
            track !== renderedTrack ||
            offset !== renderedOffset ||
            parsed !== renderedCount
        )
            render(track, offset, parsed, label);
        highlight(activeIndex(cues, port.avState.currentTime));
    }

    sync();
    const unsubscribe = port.avState.subscribeFrame(sync);

    return {
        refresh: sync,
        destroy(): void {
            unsubscribe();
            root.remove();
            releaseStyles();
        },
    };
}
