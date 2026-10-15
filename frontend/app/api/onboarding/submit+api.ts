// POST /api/onboarding/submit: draft -> submitted, only when all seven sections are done.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const POST = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.submit(user));
});
