// GENERATED from apps/site/content/docs/plugin-av.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { getAVState } from '@triiiceratops/plugin-av';

const av = getAVState(viewer.viewerState);
if (av) {
    av.seek(30);
    av.play();

    // Batched, payload-free: a notification means "read what you need".
    const stop = av.subscribe(() => {
        console.log(av.paused ? 'paused' : 'playing', 'of', av.duration);
    });

    // The playhead has its own, finer cadence and does NOT notify `subscribe`.
    const stopClock = av.subscribeFrame(() => {
        scrubber.value = String(av.currentTime);
    });
}
