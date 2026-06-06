-- DropForeignKey
ALTER TABLE "connected_stats" DROP CONSTRAINT IF EXISTS "connected_stats_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "connected_stats";
