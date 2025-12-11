import { describe, it, expect } from "vitest";
import { parseAnnotation } from "./annotationAdapter";

describe("annotationAdapter", () => {
  describe("parseAnnotation", () => {
    it("should correctly parse a simple xywh string target", () => {
      const annotation = {
        "@id": "http://example.org/anno1",
        on: "http://example.org/image1#xywh=10,20,100,200",
        label: "Test Annotation",
      };

      const result = parseAnnotation(annotation, 0);

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.geometry.type).toBe("RECTANGLE");

      const geometry = result.geometry;
      if ("x" in geometry) {
        expect(geometry).toEqual({
          type: "RECTANGLE",
          x: 10,
          y: 20,
          w: 100,
          h: 200,
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

      const result = parseAnnotation(annotation, 1);

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.geometry.type).toBe("POLYGON");

      const geometry = result.geometry;
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
      const result = parseAnnotation(mockManifestoAnno, 2);

      expect(result?.id).toBe("http://example.org/manifesto-anno");

      const geometry = result?.geometry;
      if (geometry && "x" in geometry) {
        expect(geometry).toMatchObject({
          type: "RECTANGLE",
          x: 5,
          y: 5,
          w: 50,
          h: 50,
        });
      }

      expect(result?.body.value).toBe("Manifesto Body");
    });

    it("should return null for invalid annotations with no geometry", () => {
      const invalidAnno = {
        "@id": "bad-anno",
        on: "http://example.org/canvas1", // No media fragment or selector
      };

      const result = parseAnnotation(invalidAnno, 3);
      expect(result).toBeNull();
    });
  });
});
