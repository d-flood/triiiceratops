import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MIN_PIXEL_RATIO,
    DEFAULT_MIN_ZOOM_IMAGE_RATIO,
    MOBILE_DRAWER_FALLBACK,
    shouldUseMobileDrawerFallback,
} from './osdDefaults';

describe('osd defaults', () => {
    it('uses mobile drawer fallback for Android Chrome when drawer is not overridden', () => {
        const userAgent =
            'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        expect(
            shouldUseMobileDrawerFallback({
                userAgent,
                drawerOverride: undefined,
            }),
        ).toBe(true);
    });

    it('uses mobile drawer fallback for iOS Safari when drawer is not overridden', () => {
        const userAgent =
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
        expect(
            shouldUseMobileDrawerFallback({
                userAgent,
                drawerOverride: undefined,
            }),
        ).toBe(true);
    });

    it('uses mobile drawer fallback for iOS Chrome when drawer is not overridden', () => {
        const userAgent =
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
        expect(
            shouldUseMobileDrawerFallback({
                userAgent,
                drawerOverride: undefined,
            }),
        ).toBe(true);
    });

    it('does not force mobile drawer fallback on desktop', () => {
        const userAgent =
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        expect(
            shouldUseMobileDrawerFallback({
                userAgent,
                drawerOverride: undefined,
            }),
        ).toBe(false);
    });

    it('respects consumer drawer override on mobile', () => {
        const userAgent =
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
        expect(
            shouldUseMobileDrawerFallback({
                userAgent,
                drawerOverride: ['webgl'],
            }),
        ).toBe(false);
    });

    it('keeps conservative tile loading defaults to avoid eager high-zoom fetches', () => {
        expect(DEFAULT_MIN_PIXEL_RATIO).toBe(0.5);
        expect(DEFAULT_MIN_ZOOM_IMAGE_RATIO).toBe(0.9);
        expect(MOBILE_DRAWER_FALLBACK).toEqual(['canvas', 'webgl', 'html']);
    });
});
