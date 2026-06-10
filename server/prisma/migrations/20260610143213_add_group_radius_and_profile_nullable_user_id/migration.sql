/*
  Warnings:

  - You are about to drop the column `editable_image` on the `group_chats` table. All the data in the column will be lost.
  - You are about to drop the column `editable_message` on the `group_chats` table. All the data in the column will be lost.
  - You are about to drop the column `editable_name` on the `group_chats` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `profiles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `message` on the `profiles` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.

*/
-- AlterTable
ALTER TABLE "group_chats" DROP COLUMN "editable_image",
DROP COLUMN "editable_message",
DROP COLUMN "editable_name",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "radius" DOUBLE PRECISION NOT NULL DEFAULT 2000;

-- AlterTable
ALTER TABLE "profiles" ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "name" SET DEFAULT 'Unnamed',
ALTER COLUMN "name" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "message" SET DATA TYPE VARCHAR(50);
