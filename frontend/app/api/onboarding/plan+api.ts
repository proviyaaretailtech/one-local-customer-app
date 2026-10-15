// PUT /api/onboarding/plan: pos_and_onelocal | onelocal_app.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.choosePlan(user, await readBody(request)));
});
