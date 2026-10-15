// POST /api/onboarding/documents/upload: ask for a private upload slot {kind, content_type, size, file_name}.
import { json, readBody, route } from '../../../../server/http';
import * as onboarding from '../../../../server/partner-onboarding';

export const POST = route(async request => {
  const user = await onboarding.applicant(request);
  return json(await onboarding.askUpload(user, await readBody(request)));
});
