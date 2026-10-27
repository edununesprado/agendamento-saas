import { API_URL } from '@/lib/api';

export type TenantLogoInfo = {
  slug: string;
  logoUrl?: string | null;
  hasStoredLogo?: boolean;
};

/**
 * A logo lives in PostgreSQL, but browsers fetch it through the public
 * binary endpoint. Legacy external logo URLs remain supported.
 *
 * revision refreshes the image after upload/replacement without making the
 * browser depend on its previous cached URL.
 */
export function getTenantLogoUrl(
  tenant: TenantLogoInfo | null | undefined,
  revision?: number,
): string | null {
  if (!tenant) return null;

  if (tenant.hasStoredLogo) {
    const base = API_URL.replace(/\/+$/, '');
    const path = `/public/tenants/${encodeURIComponent(tenant.slug)}/logo`;
    return `${base}${path}${revision ? `?v=${revision}` : ''}`;
  }

  return tenant.logoUrl?.trim() || null;
}
