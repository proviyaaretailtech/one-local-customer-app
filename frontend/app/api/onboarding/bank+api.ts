// PUT /api/onboarding/bank (section 6). {draft:true} is "Save for later". Account number is stored encrypted.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.saveBank(user, await readBody(request)));
});
