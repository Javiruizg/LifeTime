/*
  Warnings:

  - You are about to drop the column `device_token` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[device_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `device_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "users_device_token_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "device_token",
ADD COLUMN     "device_id" TEXT NOT NULL,
ADD COLUMN     "refresh_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_device_id_key" ON "users"("device_id");
