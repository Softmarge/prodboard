-- AlterTable
ALTER TABLE "InviteLink" ADD COLUMN "teamId" TEXT;

-- CreateIndex
CREATE INDEX "InviteLink_teamId_idx" ON "InviteLink"("teamId");

-- AddForeignKey
ALTER TABLE "InviteLink" ADD CONSTRAINT "InviteLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
