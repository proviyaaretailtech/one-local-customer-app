// PUT /api/onboarding/identity (section 5): verification consent and the last four Aadhaar digits.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.saveIdentity(user, await readBody(request)));
});
