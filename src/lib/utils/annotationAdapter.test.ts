import { describe, it, expect } from "vitest";
import { convertToAnnotoriousFormat } from "./annotationAdapter";

describe("annotationAdapter", () => {
  describe("convertToAnnotoriousFormat", () => {
    it("should correctly parse a simple xywh string target", () => {
      const annotation = {
        "@id": "http://example.org/anno1",
        on: "http://example.org/image1#xywh=10,20,100,200",
        label: "Test Annotation",
      };

      const result = convertToAnnotoriousFormat(annotation, 0);

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.target.selector.type).toBe("RECTANGLE");

      const geometry = result.target.selector.geometry;
      if ("x" in geometry) {
        expect(geometry).toEqual({
          x: 10,
          y: 20,
          w: 100,
          h: 200,
          bounds: { minX: 10, minY: 20, maxX: 110, maxY: 220 },
        });
      } else {
        throw new Error("Geometry should be RECTANGLE type with x, y, w, h");
      }
    });

    it("should extract SVG selector geometry", () => {
      const annotation = {
        "@id": "http://example.org/anno2",
        on: {
          selector: {
            type: "SvgSelector",
            value: '<svg><polygon points="10,10 50,10 50,50 10,50" /></svg>',
          },
        },
      };

      const result = convertToAnnotoriousFormat(annotation, 1);

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.target.selector.type).toBe("POLYGON");

      const geometry = result.target.selector.geometry;
      if ("points" in geometry) {
        expect(geometry.points).toHaveLength(4);
        expect(geometry.points).toEqual([
          [10, 10],
          [50, 10],
          [50, 50],
          [10, 50],
        ]);
      } else {
        throw new Error("Geometry should be POLYGON type with points");
      }
    });

    it("should handle Manifesto-style getTarget and getId methods", () => {
      const mockManifestoAnno = {
        getId: () => "http://example.org/manifesto-anno",
        getTarget: () => "http://example.org/canvas1#xywh=5,5,50,50",
        getBody: () => [
          { getValue: () => "Manifesto Body", getFormat: () => "text/plain" },
        ],
      };

      // @ts-ignore - mocking complex object
      const result = convertToAnnotoriousFormat(mockManifestoAnno, 2);

      expect(result?.id).toBe("http://example.org/manifesto-anno");

      const geometry = result?.target.selector.geometry;
      if (geometry && "x" in geometry) {
        expect(geometry).toMatchObject({
          x: 5,
          y: 5,
          w: 50,
          h: 50,
        });
      }

      expect(result?.bodies[0].value).toBe("Manifesto Body");
    });

    it("should return null for invalid annotations with no geometry", () => {
      const invalidAnno = {
        "@id": "bad-anno",
        on: "http://example.org/canvas1", // No media fragment or selector
      };

      const result = convertToAnnotoriousFormat(invalidAnno, 3);
      expect(result).toBeNull();
    });
  });
});
