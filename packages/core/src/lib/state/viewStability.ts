// Kept out of ViewerState so the check never reaches its public type.
const checks = new WeakMap<object, () => boolean>();

export function registerViewStability(state: object, check: () => boolean) {
    checks.set(state, check);
}

export function isViewStable(state: object): boolean {
    return !!checks.get(state)?.();
}
