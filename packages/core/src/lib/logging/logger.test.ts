// Core logger (ticket 18): silent by default, opt-in via debug mode.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    configureLogging,
    isDebugEnabled,
    logger,
    LOG_PREFIX,
} from './logger';

afterEach(() => {
    // Restore the default silent state + console sink between tests.
    configureLogging({ debug: false, sink: null });
    vi.restoreAllMocks();
});

describe('logger', () => {
    it('is silent by default (production is quiet)', () => {
        const sink = vi.fn();
        configureLogging({ sink });
        expect(isDebugEnabled()).toBe(false);

        logger.debug('a');
        logger.info('b');
        logger.warn('c');
        logger.error('d');

        expect(sink).not.toHaveBeenCalled();
    });

    it('emits every level to the sink when debug is enabled', () => {
        const sink = vi.fn();
        configureLogging({ debug: true, sink });
        expect(isDebugEnabled()).toBe(true);

        logger.debug('a');
        logger.info('b');
        logger.warn('c');
        logger.error('d');

        expect(sink).toHaveBeenCalledTimes(4);
        expect(sink).toHaveBeenNthCalledWith(1, 'debug', ['a']);
        expect(sink).toHaveBeenNthCalledWith(3, 'warn', ['c']);
    });

    it('defaults to a console sink that prefixes records', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        configureLogging({ debug: true });

        logger.warn('hello', 42);

        expect(spy).toHaveBeenCalledWith(LOG_PREFIX, 'hello', 42);
    });

    it('goes quiet again when debug is turned off', () => {
        const sink = vi.fn();
        configureLogging({ debug: true, sink });
        logger.warn('on');
        configureLogging({ debug: false });
        logger.warn('off');

        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith('warn', ['on']);
    });
});
