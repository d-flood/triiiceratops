// One witness for all six translated event channels, shared by both viewers.
//
// The wrapper's callback (React) / emit (Vue) records the payload it received.
// A DOM listener on `document` — the events are `bubbles: true, composed: true`,
// so they escape the shadow root and reach it AFTER the wrapper's own
// element-level listener — then compares that payload against the raw
// `CustomEvent.detail` by IDENTITY. That is the whole "framework handlers
// receive the exact detail object, not the DOM envelope" contract, observed
// from outside the wrapper.

export const CHANNELS = [
    'statechange',
    'canvaschange',
    'manifestchange',
    'choicechange',
    'pluginerror',
    'viewererror',
];

const records = new Map();
const payloads = new Map();

function key(viewer, channel) {
    return viewer + ':' + channel;
}

function record(viewer, channel) {
    const k = key(viewer, channel);
    let entry = records.get(k);
    if (!entry) {
        entry = {
            viewer,
            channel,
            callbackCount: 0,
            domCount: 0,
            identityOk: null,
            envelopeOk: null,
            note: null,
        };
        records.set(k, entry);
    }
    return entry;
}

/** Called from the framework callback/emit with the DETAIL it was handed. */
export function onFrameworkEvent(viewer, channel, detail) {
    const entry = record(viewer, channel);
    entry.callbackCount++;
    payloads.set(key(viewer, channel), detail);
    if (channel === 'pluginerror') {
        entry.note = detail.pluginName + '/' + detail.phase;
        lastPluginError = detail;
    }
    if (channel === 'viewererror') {
        entry.note = detail.scope + '/' + detail.code;
    }
}

let lastPluginError = null;

/** The exact `PluginError` most recently delivered, with its callable `retry()`. */
export function retryLastPlugin() {
    if (!lastPluginError) return 'no plugin error was delivered';
    if (typeof lastPluginError.retry !== 'function') {
        return 'delivered PluginError has no callable retry()';
    }
    lastPluginError.retry();
    return 'retried';
}

/** Install the document-level witness. Call once, at module scope. */
export function installWitness() {
    for (const channel of CHANNELS) {
        document.addEventListener(channel, (event) => {
            const target = event.target;
            const viewer =
                target && target.id ? target.id : 'unknown-' + channel;
            const entry = record(viewer, channel);
            entry.domCount++;
            const payload = payloads.get(key(viewer, channel));
            entry.identityOk = payload === event.detail;
            entry.envelopeOk = !(payload instanceof Event);
        });
    }
}

/** A JSON-serialisable view for the Playwright assertions. */
export function snapshot() {
    const out = {};
    for (const entry of records.values()) {
        out[entry.viewer + ':' + entry.channel] = {
            callbackCount: entry.callbackCount,
            domCount: entry.domCount,
            identityOk: entry.identityOk,
            envelopeOk: entry.envelopeOk,
            note: entry.note,
        };
    }
    return out;
}

export function totals() {
    let plugin = 0;
    let viewer = 0;
    for (const entry of records.values()) {
        if (entry.channel === 'pluginerror') plugin += entry.callbackCount;
        if (entry.channel === 'viewererror') viewer += entry.callbackCount;
    }
    return { pluginerror: plugin, viewererror: viewer };
}
