// GET /api/onboarding/application: everything the onboarding screens show (sections, progress, checks, documents).
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const GET = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.getApplication(user));
});
