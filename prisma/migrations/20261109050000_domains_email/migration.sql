-- Organization email-domain allowlist
ALTER TABLE "Organization" ADD COLUMN "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- User flags for the domain rule
ALTER TABLE "User" ADD COLUMN "mustChangeEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "domainExempt" BOOLEAN NOT NULL DEFAULT false;

-- Pending email change (OTP to the new address)
CREATE TABLE "PendingEmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingEmailChange_userId_key" ON "PendingEmailChange"("userId");

ALTER TABLE "PendingEmailChange" ADD CONSTRAINT "PendingEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
