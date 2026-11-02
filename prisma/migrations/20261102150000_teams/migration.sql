-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignerUserId" TEXT,
ADD COLUMN     "committedDate" TIMESTAMP(3),
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "parentTaskId" TEXT,
ADD COLUMN     "requestState" TEXT,
ADD COLUMN     "targetTeamId" TEXT,
ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRODUCT',
    "parentTeamId" TEXT,
    "memberVisibility" TEXT NOT NULL DEFAULT 'ALL',
    "membersSeeSubteams" BOOLEAN NOT NULL DEFAULT false,
    "defaultReviewerId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

-- CreateIndex
CREATE INDEX "Team_parentTeamId_idx" ON "Team"("parentTeamId");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_idx" ON "TeamMembership"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");

-- CreateIndex
CREATE INDEX "TeamLead_teamId_idx" ON "TeamLead"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamLead_userId_teamId_key" ON "TeamLead"("userId", "teamId");

-- CreateIndex
CREATE INDEX "Thread_organizationId_idx" ON "Thread"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_contextType_contextId_key" ON "Thread"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Product_teamId_idx" ON "Product"("teamId");

-- CreateIndex
CREATE INDEX "Task_teamId_idx" ON "Task"("teamId");

-- CreateIndex
CREATE INDEX "Task_targetTeamId_idx" ON "Task"("targetTeamId");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignerUserId_fkey" FOREIGN KEY ("assignerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_targetTeamId_fkey" FOREIGN KEY ("targetTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_parentTeamId_fkey" FOREIGN KEY ("parentTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_defaultReviewerId_fkey" FOREIGN KEY ("defaultReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLead" ADD CONSTRAINT "TeamLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLead" ADD CONSTRAINT "TeamLead_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Data backfill: migrate existing data into the teams model
-- (design doc section 11). All additive; safe to run once.
-- ============================================================

-- 1. One default "General" team per organisation.
INSERT INTO "Team" ("id","name","kind","parentTeamId","memberVisibility","membersSeeSubteams","organizationId","createdBy","createdAt")
SELECT gen_random_uuid()::text, 'General', 'PRODUCT', NULL, 'ALL', false, o."id", NULL, CURRENT_TIMESTAMP
FROM "Organization" o;

-- 2. Put every existing product in its org's General team.
UPDATE "Product" p SET "teamId" = t."id"
FROM "Team" t
WHERE t."organizationId" = p."organizationId" AND t."name" = 'General';

-- 3. Put every existing task in its org's General team.
UPDATE "Task" tk SET "teamId" = t."id"
FROM "Team" t
WHERE t."organizationId" = tk."organizationId" AND t."name" = 'General';

-- 4. Primary, active membership of the General team for every user.
INSERT INTO "TeamMembership" ("id","userId","teamId","isPrimary","status","createdAt")
SELECT gen_random_uuid()::text, u."id", t."id", true, 'active', CURRENT_TIMESTAMP
FROM "User" u
JOIN "Team" t ON t."organizationId" = u."organizationId" AND t."name" = 'General';

-- 5a. Assigner = author of the task's "created" activity (matched by name).
UPDATE "Task" tk SET "assignerUserId" = u."id"
FROM "Activity" a, "User" u
WHERE a."taskId" = tk."id" AND a."type" = 'created'
  AND u."organizationId" = tk."organizationId"
  AND lower(u."name") = lower(a."author")
  AND tk."assignerUserId" IS NULL;

-- 5b. Otherwise fall back to the product's managing PM.
UPDATE "Task" tk SET "assignerUserId" = u."id"
FROM "Product" p, "User" u
WHERE tk."productId" = p."id" AND p."pm" IS NOT NULL
  AND u."organizationId" = p."organizationId"
  AND lower(u."name") = lower(p."pm")
  AND tk."assignerUserId" IS NULL;

-- 6. Task Owner and Reviewer roles become Member (PM). Admin and Exec untouched.
UPDATE "User" SET "role" = 'PM' WHERE "role" IN ('TASK_OWNER','REVIEWER');

-- 7. Existing pending (unapproved) tasks become normal tasks.
UPDATE "Task" SET "pending" = false WHERE "pending" = true;
