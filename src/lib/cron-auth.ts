// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations
// (vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs). Fail closed when
// the secret is not configured.
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
