// POST /api/onboarding/documents: confirm a file the phone has finished uploading and attach it (replaces an earlier one of the same kind).
import { json, readBody, route } from '../../../server/http';
import * as onboarding from '../../../server/partner-onboarding';

export const POST = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.confirmUpload(user, await readBody(request)));
});
