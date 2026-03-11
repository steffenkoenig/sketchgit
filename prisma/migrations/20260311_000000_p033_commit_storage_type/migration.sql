-- CreateEnum
CREATE TYPE "CommitStorageType" AS ENUM ('SNAPSHOT', 'DELTA');

-- AlterTable
ALTER TABLE "Commit" ADD COLUMN "storageType" "CommitStorageType" NOT NULL DEFAULT 'SNAPSHOT';
