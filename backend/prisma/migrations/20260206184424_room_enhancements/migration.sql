/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Room` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WaitingRoomStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "audioOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "maxParticipants" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "videoEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "waitingRoom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WaitingRoom" (
    "id" TEXT NOT NULL,
    "status" "WaitingRoomStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "WaitingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitingRoom_userId_roomId_key" ON "WaitingRoom"("userId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- AddForeignKey
ALTER TABLE "WaitingRoom" ADD CONSTRAINT "WaitingRoom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitingRoom" ADD CONSTRAINT "WaitingRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
