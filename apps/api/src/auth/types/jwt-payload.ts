export interface JwtPayload {
  sub: string;
  tenantId: string;
  membershipId: string;
  role: string;
}