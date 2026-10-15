// PUT /api/onboarding/profile: shop profile and owner contact (sections 1 and 2). Creates the draft on first save.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.saveProfile(user, await readBody(request)));
});
