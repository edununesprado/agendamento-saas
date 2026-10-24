-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "appointmentReminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "appointmentRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
