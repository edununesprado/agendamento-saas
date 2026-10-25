-- CreateEnum
CREATE TYPE "AppointmentAuditAction" AS ENUM ('CREATED', 'CONFIRMED', 'RESCHEDULED', 'CANCELED', 'COMPLETED', 'NO_SHOW', 'UPDATED');

-- CreateEnum
CREATE TYPE "AppointmentAuditActorType" AS ENUM ('USER', 'PUBLIC', 'SYSTEM');

-- CreateTable
CREATE TABLE "AppointmentAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "action" "AppointmentAuditAction" NOT NULL,
    "actorType" "AppointmentAuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorRole" "MembershipRole",
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_tenantId_appointmentId_createdAt_idx" ON "AppointmentAuditLog"("tenantId", "appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_tenantId_createdAt_idx" ON "AppointmentAuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_actorUserId_createdAt_idx" ON "AppointmentAuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
