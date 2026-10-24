-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Appointment_status_reminderSentAt_startsAt_idx" ON "Appointment"("status", "reminderSentAt", "startsAt");
