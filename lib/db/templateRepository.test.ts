import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => {
  const client = {
    shapeTemplate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  // P088 – prismaRead/prismaWrite alias the same mock client.
  return { prisma: client, prismaRead: client, prismaWrite: client };
});

import {
  createShapeTemplate,
  listShapeTemplates,
  getShapeTemplate,
  getShapeTemplateThumbnail,
  deleteShapeTemplate,
  getAllShapeTemplatesForExport,
} from "./templateRepository";
import { prisma } from "@/lib/db/prisma";

const mock = {
  create: prisma.shapeTemplate.create as ReturnType<typeof vi.fn>,
  findMany: prisma.shapeTemplate.findMany as ReturnType<typeof vi.fn>,
  findUnique: prisma.shapeTemplate.findUnique as ReturnType<typeof vi.fn>,
  deleteMany: prisma.shapeTemplate.deleteMany as ReturnType<typeof vi.fn>,
};

const NOW = new Date("2026-08-22T00:00:00.000Z");

describe("templateRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("createShapeTemplate", () => {
    it("passes through fields and reports hasThumbnail from the stored bytes", async () => {
      mock.create.mockResolvedValue({
        id: "tpl_1", name: "Flowchart node", createdAt: NOW, updatedAt: NOW,
        thumbnailPng: new Uint8Array([1, 2, 3]),
      });
      const result = await createShapeTemplate("usr_1", "Flowchart node", { objects: [] }, Buffer.from([1, 2, 3]));
      expect(mock.create).toHaveBeenCalledWith({
        data: { userId: "usr_1", name: "Flowchart node", canvasJson: { objects: [] }, thumbnailPng: new Uint8Array([1, 2, 3]) },
        select: { id: true, name: true, createdAt: true, updatedAt: true, thumbnailPng: true },
      });
      expect(result).toEqual({ id: "tpl_1", name: "Flowchart node", createdAt: NOW, updatedAt: NOW, hasThumbnail: true });
    });

    it("stores a null thumbnail when rendering failed", async () => {
      mock.create.mockResolvedValue({ id: "tpl_2", name: "No preview", createdAt: NOW, updatedAt: NOW, thumbnailPng: null });
      const result = await createShapeTemplate("usr_1", "No preview", { objects: [] }, null);
      expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ thumbnailPng: null }) }));
      expect(result.hasThumbnail).toBe(false);
    });
  });

  it("listShapeTemplates scopes by userId and orders by newest first", async () => {
    mock.findMany.mockResolvedValue([
      { id: "tpl_1", name: "A", createdAt: NOW, updatedAt: NOW, thumbnailPng: null },
    ]);
    const result = await listShapeTemplates("usr_1");
    expect(mock.findMany).toHaveBeenCalledWith({
      where: { userId: "usr_1" },
      select: { id: true, name: true, createdAt: true, updatedAt: true, thumbnailPng: true },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual([{ id: "tpl_1", name: "A", createdAt: NOW, updatedAt: NOW, hasThumbnail: false }]);
  });

  describe("getShapeTemplate", () => {
    it("returns the template when it belongs to the caller", async () => {
      mock.findUnique.mockResolvedValue({ id: "tpl_1", userId: "usr_1", name: "A", canvasJson: {}, createdAt: NOW, updatedAt: NOW });
      const result = await getShapeTemplate("usr_1", "tpl_1");
      expect(result?.id).toBe("tpl_1");
    });

    it("returns null when the template belongs to another user (not 403 — indistinguishable from not-found)", async () => {
      mock.findUnique.mockResolvedValue({ id: "tpl_1", userId: "usr_other", name: "A", canvasJson: {}, createdAt: NOW, updatedAt: NOW });
      const result = await getShapeTemplate("usr_1", "tpl_1");
      expect(result).toBeNull();
    });

    it("returns null when the template doesn't exist", async () => {
      mock.findUnique.mockResolvedValue(null);
      const result = await getShapeTemplate("usr_1", "tpl_missing");
      expect(result).toBeNull();
    });
  });

  describe("getShapeTemplateThumbnail", () => {
    it("returns a Buffer for the owner's template", async () => {
      mock.findUnique.mockResolvedValue({ userId: "usr_1", thumbnailPng: new Uint8Array([9, 9]) });
      const result = await getShapeTemplateThumbnail("usr_1", "tpl_1");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result).toEqual(Buffer.from([9, 9]));
    });

    it("returns null for another user's template", async () => {
      mock.findUnique.mockResolvedValue({ userId: "usr_other", thumbnailPng: new Uint8Array([9, 9]) });
      const result = await getShapeTemplateThumbnail("usr_1", "tpl_1");
      expect(result).toBeNull();
    });
  });

  describe("deleteShapeTemplate", () => {
    it("scopes the delete by both id and userId, returning true on success", async () => {
      mock.deleteMany.mockResolvedValue({ count: 1 });
      const result = await deleteShapeTemplate("usr_1", "tpl_1");
      expect(mock.deleteMany).toHaveBeenCalledWith({ where: { id: "tpl_1", userId: "usr_1" } });
      expect(result).toBe(true);
    });

    it("returns false when nothing matched (wrong owner or missing)", async () => {
      mock.deleteMany.mockResolvedValue({ count: 0 });
      const result = await deleteShapeTemplate("usr_1", "tpl_1");
      expect(result).toBe(false);
    });
  });

  it("getAllShapeTemplatesForExport scopes by userId and orders oldest first", async () => {
    mock.findMany.mockResolvedValue([]);
    await getAllShapeTemplatesForExport("usr_1");
    expect(mock.findMany).toHaveBeenCalledWith({ where: { userId: "usr_1" }, orderBy: { createdAt: "asc" } });
  });
});
