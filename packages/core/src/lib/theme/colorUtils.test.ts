import { describe, it, expect } from 'vitest';
import {
    hexToOklch,
    normalizeColor,
    isOklch,
    isHex,
    isRgb,
} from './colorUtils';

describe('colorUtils', () => {
    describe('isHex', () => {
        it('should return true for valid hex colors', () => {
            expect(isHex('#fff')).toBe(true);
            expect(isHex('#FFF')).toBe(true);
            expect(isHex('#ffffff')).toBe(true);
            expect(isHex('#FFFFFF')).toBe(true);
            expect(isHex('#3b82f6')).toBe(true);
            expect(isHex('#3B82F6')).toBe(true);
            expect(isHex('#3b82f6ff')).toBe(true); // with alpha
        });

        it('should return false for invalid hex colors', () => {
            expect(isHex('fff')).toBe(false);
            expect(isHex('#ff')).toBe(false);
            expect(isHex('#ffff')).toBe(false);
            expect(isHex('#fffff')).toBe(false);
            expect(isHex('rgb(255, 255, 255)')).toBe(false);
            expect(isHex('oklch(50% 0.2 250)')).toBe(false);
        });
    });

    describe('isRgb', () => {
        it('should return true for valid rgb colors', () => {
            expect(isRgb('rgb(255, 255, 255)')).toBe(true);
            expect(isRgb('rgb(0, 0, 0)')).toBe(true);
            expect(isRgb('rgba(255, 255, 255, 0.5)')).toBe(true);
            expect(isRgb('rgb(59 130 246)')).toBe(true); // modern syntax
        });

        it('should return false for non-rgb colors', () => {
            expect(isRgb('#fff')).toBe(false);
            expect(isRgb('oklch(50% 0.2 250)')).toBe(false);
        });
    });

    describe('isOklch', () => {
        it('should return true for oklch colors', () => {
            expect(isOklch('oklch(50% 0.2 250)')).toBe(true);
            expect(isOklch('OKLCH(50% 0.2 250)')).toBe(true);
            expect(isOklch('  oklch(50% 0.2 250)  ')).toBe(true);
        });

        it('should return false for non-oklch colors', () => {
            expect(isOklch('#fff')).toBe(false);
            expect(isOklch('rgb(255, 255, 255)')).toBe(false);
        });
    });

    describe('hexToOklch', () => {
        it('should convert black correctly', () => {
            const result = hexToOklch('#000000');
            expect(result).toMatch(/^oklch\(0\.00%/);
        });

        it('should convert white correctly', () => {
            const result = hexToOklch('#ffffff');
            // White should have high lightness and low chroma
            expect(result).toMatch(/^oklch\(100\.00%/);
        });

        it('should convert primary blue correctly', () => {
            const result = hexToOklch('#3b82f6');
            // Should produce a valid oklch string
            expect(result).toMatch(/^oklch\(\d+\.\d+% \d+\.\d+ \d+\.\d+\)$/);
        });

        it('should handle short hex notation', () => {
            const result = hexToOklch('#fff');
            expect(result).toMatch(/^oklch\(100\.00%/);
        });

        it('should handle hex with alpha (ignoring alpha)', () => {
            const result = hexToOklch('#3b82f680');
            // Should produce same result as without alpha
            expect(result).toMatch(/^oklch\(\d+\.\d+% \d+\.\d+ \d+\.\d+\)$/);
        });
    });

    describe('normalizeColor', () => {
        it('should pass through oklch colors unchanged', () => {
            const oklch = 'oklch(65.00% 0.2000 250.00)';
            expect(normalizeColor(oklch)).toBe(oklch);
        });

        it('should convert hex to oklch', () => {
            const result = normalizeColor('#3b82f6');
            expect(result).toMatch(/^oklch\(/);
        });

        it('should convert rgb to oklch', () => {
            const result = normalizeColor('rgb(59, 130, 246)');
            expect(result).toMatch(/^oklch\(/);
        });

        it('should pass through unknown formats with warning', () => {
            // Named colors, CSS variables, etc. should pass through
            const result = normalizeColor('var(--some-color)');
            expect(result).toBe('var(--some-color)');
        });
    });
});
