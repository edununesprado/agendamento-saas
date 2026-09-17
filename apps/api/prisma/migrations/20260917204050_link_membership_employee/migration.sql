/*
  Warnings:

  - A unique constraint covering the columns `[membershipId]` on the table `Employee` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "membershipId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_membershipId_key" ON "Employee"("membershipId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
