-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('HOURLY', 'DAILY');

-- CreateTable
CREATE TABLE "RoomSubscription" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'DAILY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "RoomSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomSubscription_frequency_lastSentAt_idx" ON "RoomSubscription"("frequency", "lastSentAt");

-- CreateIndex
CREATE INDEX "RoomSubscription_userId_idx" ON "RoomSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSubscription_roomId_userId_key" ON "RoomSubscription"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "RoomSubscription" ADD CONSTRAINT "RoomSubscription_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSubscription" ADD CONSTRAINT "RoomSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
