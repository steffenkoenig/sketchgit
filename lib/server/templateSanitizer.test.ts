import { describe, it, expect } from "vitest";
import { sanitizeTemplateCanvasJson, TemplateValidationError } from "./templateSanitizer";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    objects: [
      { type: "rect", left: 10, top: 20, _id: "obj_should_be_stripped", ...overrides },
    ],
  };
}

describe("sanitizeTemplateCanvasJson", () => {
  it("accepts a well-formed payload and strips _id", () => {
    const result = sanitizeTemplateCanvasJson(validPayload());
    expect((result.objects as Array<Record<string, unknown>>)[0]._id).toBeUndefined();
  });

  it("rejects non-object input", () => {
    expect(() => sanitizeTemplateCanvasJson("not an object")).toThrow(TemplateValidationError);
    expect(() => sanitizeTemplateCanvasJson(null)).toThrow(TemplateValidationError);
    expect(() => sanitizeTemplateCanvasJson([1, 2])).toThrow(TemplateValidationError);
  });

  it("rejects a payload without an objects array", () => {
    expect(() => sanitizeTemplateCanvasJson({ foo: "bar" })).toThrow(TemplateValidationError);
  });

  it("rejects an empty objects array", () => {
    expect(() => sanitizeTemplateCanvasJson({ objects: [] })).toThrow(TemplateValidationError);
  });

  it("rejects a payload with too many objects", () => {
    const objects = Array.from({ length: 301 }, (_, i) => ({ type: "rect", id: i }));
    expect(() => sanitizeTemplateCanvasJson({ objects })).toThrow(TemplateValidationError);
  });

  it("rejects an oversized payload", () => {
    const objects = [{ type: "rect", huge: "x".repeat(400_000) }];
    expect(() => sanitizeTemplateCanvasJson({ objects })).toThrow(TemplateValidationError);
  });

  it("strips a javascript: _link (XSS vector)", () => {
    const result = sanitizeTemplateCanvasJson(validPayload({ _link: "javascript:alert(1)" }));
    expect((result.objects as Array<Record<string, unknown>>)[0]._link).toBeUndefined();
  });

  it("keeps a safe https: _link", () => {
    const result = sanitizeTemplateCanvasJson(validPayload({ _link: "https://example.com" }));
    expect((result.objects as Array<Record<string, unknown>>)[0]._link).toBe("https://example.com");
  });

  it("strips a remote http(s) image src (SSRF vector via server-side thumbnail rendering)", () => {
    const result = sanitizeTemplateCanvasJson(validPayload({ src: "http://169.254.169.254/latest/meta-data/" }));
    expect((result.objects as Array<Record<string, unknown>>)[0].src).toBeUndefined();
  });

  it("keeps a data:image/png src", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const result = sanitizeTemplateCanvasJson(validPayload({ src }));
    expect((result.objects as Array<Record<string, unknown>>)[0].src).toBe(src);
  });

  it("recurses into nested group objects", () => {
    const payload = {
      objects: [
        {
          type: "group",
          _id: "group_id",
          objects: [
            { type: "rect", _id: "child_id", _link: "javascript:evil()" },
          ],
        },
      ],
    };
    const result = sanitizeTemplateCanvasJson(payload);
    const group = (result.objects as Array<Record<string, unknown>>)[0];
    expect(group._id).toBeUndefined();
    const child = (group.objects as Array<Record<string, unknown>>)[0];
    expect(child._id).toBeUndefined();
    expect(child._link).toBeUndefined();
  });
});
