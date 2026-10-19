-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "bookingMaxAdvanceDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "bookingMinAdvanceMinutes" INTEGER NOT NULL DEFAULT 60;
