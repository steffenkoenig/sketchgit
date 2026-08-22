/**
 * templateRepository – server-side data access for user-owned custom shape
 * templates (P095). All operations are scoped by userId; there is no
 * cross-user sharing of templates.
 */
// P088 – prismaRead routes to the read replica when configured; prismaWrite
// always targets the primary.
import { prismaRead, prismaWrite } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export interface ShapeTemplateSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  hasThumbnail: boolean;
}

export interface ShapeTemplateRecord {
  id: string;
  userId: string;
  name: string;
  canvasJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export async function createShapeTemplate(
  userId: string,
  name: string,
  canvasJson: object,
  thumbnailPng: Buffer | null,
): Promise<ShapeTemplateSummary> {
  const created = await prismaWrite.shapeTemplate.create({
    data: {
      userId,
      name,
      canvasJson: canvasJson as Prisma.InputJsonValue,
      thumbnailPng: thumbnailPng ? new Uint8Array(thumbnailPng) : null,
    },
    select: { id: true, name: true, createdAt: true, updatedAt: true, thumbnailPng: true },
  });
  return {
    id: created.id,
    name: created.name,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    hasThumbnail: created.thumbnailPng !== null,
  };
}

export async function listShapeTemplates(userId: string): Promise<ShapeTemplateSummary[]> {
  const templates = await prismaRead.shapeTemplate.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, updatedAt: true, thumbnailPng: true },
    orderBy: { createdAt: "desc" },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    hasThumbnail: t.thumbnailPng !== null,
  }));
}

export async function getShapeTemplate(
  userId: string,
  templateId: string,
): Promise<ShapeTemplateRecord | null> {
  const template = await prismaRead.shapeTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.userId !== userId) return null;
  return template;
}

export async function getShapeTemplateThumbnail(
  userId: string,
  templateId: string,
): Promise<Buffer | null> {
  const template = await prismaRead.shapeTemplate.findUnique({
    where: { id: templateId },
    select: { userId: true, thumbnailPng: true },
  });
  if (!template || template.userId !== userId) return null;
  return template.thumbnailPng ? Buffer.from(template.thumbnailPng) : null;
}

export async function deleteShapeTemplate(userId: string, templateId: string): Promise<boolean> {
  const result = await prismaWrite.shapeTemplate.deleteMany({ where: { id: templateId, userId } });
  return result.count > 0;
}

export async function getAllShapeTemplatesForExport(
  userId: string,
): Promise<ShapeTemplateRecord[]> {
  return prismaRead.shapeTemplate.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}
