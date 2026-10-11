# Rider KYC: DigiLocker, PAN, selfie, driving licence, vehicle RC

Rider identity checks run on Cashfree Secure ID (the same provider as payments). The engine lives in `frontend/server/kyc/`; `server/rider-kyc.ts`
writes its answers into `rider_documents`. Spec: `specs/rider-kyc-digilocker/spec.md` in the workspace root.

## Switching it on

Put these on the server (names only here; values go in `frontend/.env`, never in chat, the repository or a journal):

| Name | What |
|---|---|
| `CASHFREE_SECURE_ID_CLIENT_ID`, `CASHFREE_SECURE_ID_CLIENT_SECRET` | Secure ID keys from the Cashfree dashboard (sandbox first: a `cfsk_ma_test_` secret selects the sandbox by itself). |
| `KYC_PAYLOAD_KEY` | 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts the Aadhaar photo kept for the selfie match. |
| `CASHFREE_SECURE_ID_PUBLIC_KEY` | Optional. Cashfree's 2FA public key (PEM), needed when the server's IP address is not whitelisted at Cashfree. A serverless host's never is. |
| `KYC_PUBLIC_BASE_URL` (else `PUBLIC_BASE_URL`) | Public https address of this API. DigiLocker sends the rider's browser to `<it>/api/rider/kyc/digilocker/return`. In production it must be set. |
| `KYC_APP_RETURN_URL` | Where that return page sends the rider in the app. Default `onelocalrider://onboarding/kyc`. In Expo development use the `exp://…/--/onboarding/kyc` address. |
| `KYC_ATTEMPTS_PER_DAY` (5), `KYC_FACE_MATCH_THRESHOLD` (0.75), `CASHFREE_SECURE_ID_ENV`, `CASHFREE_SECURE_ID_API_VERSION` | Optional. |

* **None of the first three set:** nothing changes. DigiLocker answers `501 provider_not_configured`; documents are uploads that a person checks.
* **Only some of the three set:** same as none, and the server log says which name is missing.
* **All three set but wrong** (the payload key is not 32 bytes, the environment does not match the secret): the KYC routes answer `503 kyc_misconfigured` and the log names the variable (never the value). Uploads keep working.
* **All set:** the engine runs.

## What a rider can do (Rider app screen: `onboarding/kyc`)

1. **Aadhaar.** `POST /rider/kyc/digilocker/start` returns `{ redirect_url, verification_id }`. The rider signs in to DigiLocker in the browser and allows access;
   DigiLocker sends the browser to `/api/rider/kyc/digilocker/return`, which sends the rider back into the app. The app then calls
   `POST /rider/kyc/documents { kind: "aadhaar", source: "digilocker", verification_id }` (or `GET /rider/kyc/digilocker/status`) and gets
   `verified`, `pending` (not finished yet), or `rejected` (consent not given, session expired, the name on the Aadhaar is not the profile name, or the rider is outside 18 to 80).
2. **PAN.** `POST /rider/kyc/documents { kind: "pan", number, source: "upload" }` or `POST /rider/kyc/pan { number }`. Matched to the Aadhaar name.
3. **Selfie.** Upload the photo (`kyc_selfie`), then `POST /rider/kyc/documents { kind: "selfie", asset_id }` or `POST /rider/kyc/selfie { asset_id }`. Liveness, then a face match with the Aadhaar photo.
4. **Driving licence.** `{ kind: "dl", number, dob?, asset_id? }` or `POST /rider/kyc/driving-licence`. The date of birth comes from Aadhaar unless typed.
5. **Vehicle RC** (not needed to submit). `POST /rider/kyc/vehicle-rc { number? }`; with no number the vehicle on the application is checked.

Every answer is the document (`id, kind, status, number_masked, asset_id, source, expires_on, rejection_reason, reviewed_at`). `rejection_reason` is plain words for the rider, also for `pending`.

Uploads stay available: a photo with no number, or any photo sent while Cashfree is down, is saved `pending` for a person (no `verification_id`).

## What is stored

* `rider_documents`: one row per (rider, kind, verification id). Software-verified = `status = 'verified'` with a `verification_id`. DigiLocker Aadhaar has `source = 'digilocker'`.
  Numbers are masked (`XXXX XXXX 1234`, `ABXXXXX34F`, `MH14•••••••2345`). The database refuses a full Aadhaar or PAN there.
* `kyc_profiles` (service role only): legal name and date of birth from Aadhaar, the Aadhaar's last four digits, masked PAN and licence, the vehicle number, scores. The Aadhaar photo is encrypted
  and deleted right after the face match, and in any case after 24 hours (cleared on every KYC call and hourly by `pg_cron`).
* `kyc_checks` (service role only, never changed): one row per Cashfree call, no numbers, no pictures. It is also the daily limit (5 per rider per check).
* Deleting a rider deletes all of it.

## Limits

* 20 requests a minute per rider on the KYC routes, 20 Cashfree-bound checks an hour per rider, 5 attempts a day per rider per check (database). Waiting for DigiLocker is not an attempt.
* A rider whose Aadhaar is verified cannot start DigiLocker again (409 `already_verified`). An application that has been sent in cannot change documents (409 `locked`).

## Trying it on the sandbox

1. Put the three names above on the server with Cashfree **sandbox** keys; `KYC_PUBLIC_BASE_URL` must be an address Cashfree's sandbox can send a browser to (a tunnel to your laptop works).
2. Run the Rider app, register, go to KYC. Use Cashfree's sandbox sample data (their docs list the test Aadhaar, PAN and licence values for each check).
3. `npx tsx scripts/rider-kyc-checks.ts` runs the whole journey against a fake Cashfree and the local database (no keys needed).
