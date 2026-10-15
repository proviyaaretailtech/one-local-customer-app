// PUT /api/onboarding/agreement (section 7): acknowledge the agreement version.
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const PUT = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.acceptAgreement(user, await readBody(request)));
});
