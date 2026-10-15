// GET /api/onboarding/documents/{kind}/preview: a short-lived link to preview the person's own uploaded document.
import { json, route } from '../../../../../server/http';
import * as onboarding from '../../../../../server/partner-onboarding';

export const GET = route(async (request, params) => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.previewUrl(user, String(params?.kind ?? '')));
});
