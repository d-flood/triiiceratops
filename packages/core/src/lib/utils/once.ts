/**
 * Wrap a teardown so it runs at most once, however many times it is called.
 *
 * Every registration in core hands back a dispose the caller may run more than
 * once — a plugin's own cleanup and the backstop that releases what the plugin
 * forgot both take the same handle — so idempotence is the contract rather than
 * a courtesy. Any identity check ("is the thing I registered still the thing
 * held?") belongs inside `fn`: the token is spent on the first call regardless,
 * which is what makes a late dispose unable to evict a successor.
 */
export function once(fn: () => void): () => void {
    let called = false;
    return () => {
        if (called) return;
        called = true;
        fn();
    };
}
