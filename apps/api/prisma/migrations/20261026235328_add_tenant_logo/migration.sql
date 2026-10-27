-- CreateTable
CREATE TABLE "TenantLogo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantLogo_tenantId_key" ON "TenantLogo"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantLogo" ADD CONSTRAINT "TenantLogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
