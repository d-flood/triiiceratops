export type TimelineModule = typeof import('./timeline/index');

export async function loadTimeline(): Promise<TimelineModule | null> {
    try {
        return await import('./timeline/index');
    } catch {
        return null;
    }
}
