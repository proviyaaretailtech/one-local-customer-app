// GET /api/onboarding/taxonomy: the lists the onboarding screens show (categories, states, banks).
import { json, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const GET = route(async request => {
  await onboarding.applicant(request);
  return json(onboarding.lists());
});
