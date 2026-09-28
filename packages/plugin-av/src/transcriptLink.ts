export type TranscriptModule = typeof import('./transcript/index');

export async function loadTranscript(): Promise<TranscriptModule | null> {
    try {
        return await import('./transcript/index');
    } catch {
        return null;
    }
}
