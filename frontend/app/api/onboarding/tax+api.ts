// PUT /api/onboarding/tax (section 4). PAN is stored encrypted.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.saveTax(user, await readBody(request)));
});
