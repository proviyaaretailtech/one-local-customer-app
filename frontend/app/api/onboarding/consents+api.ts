// PUT /api/onboarding/consents (section 7): terms, privacy, optional marketing.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.saveConsents(user, await readBody(request)));
});
