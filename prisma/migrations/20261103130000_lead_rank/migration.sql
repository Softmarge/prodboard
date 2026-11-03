-- AlterTable: every existing lead starts at rank 1
ALTER TABLE "TeamLead" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;

-- Backfill: if a team already has several leads, give them distinct ranks
-- (1, 2, 3, ...) by creation order so the unique index below can be created.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "teamId" ORDER BY "createdAt", "id") AS rn
  FROM "TeamLead"
)
UPDATE "TeamLead" tl SET "rank" = ranked.rn
FROM ranked
WHERE ranked."id" = tl."id";

-- CreateIndex: one person per rank per team
CREATE UNIQUE INDEX "TeamLead_teamId_rank_key" ON "TeamLead"("teamId", "rank");
