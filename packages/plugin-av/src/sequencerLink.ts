export type SequencerModule = typeof import('./sequencer/index');

export async function loadSequencer(): Promise<SequencerModule | null> {
    try {
        return await import('./sequencer/index');
    } catch {
        return null;
    }
}
