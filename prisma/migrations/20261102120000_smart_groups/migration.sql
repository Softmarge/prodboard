-- AlterTable
ALTER TABLE "ProductGroup" ADD COLUMN     "ownerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "taskIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
