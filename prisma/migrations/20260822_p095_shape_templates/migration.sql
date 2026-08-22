-- CreateTable
CREATE TABLE "ShapeTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canvasJson" JSONB NOT NULL,
    "thumbnailPng" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShapeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShapeTemplate_userId_idx" ON "ShapeTemplate"("userId");

-- AddForeignKey
ALTER TABLE "ShapeTemplate" ADD CONSTRAINT "ShapeTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
