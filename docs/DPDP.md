# One Local and India's data protection law (DPDP) — compliance map

> **This is not legal advice.** It is an engineering and product map written by the assistant from
> its understanding of the Digital Personal Data Protection Act, 2023 ("the Act") and the Digital
> Personal Data Protection Rules, 2025 ("the Rules"). Section and rule numbers, dates, periods and
> penalties below must be **confirmed by a lawyer** before anyone relies on them, and the privacy
> notice in the app must be reviewed by that lawyer before launch.

Written 27 September 2026. Covers the One Local (OneCity) customer app, its API (`frontend/app/api`,
`frontend/server`) and the `ol_*` tables in the shared Supabase database. The founder's documents
(checked through NotebookLM on 27 September) name a "Data Governance" layer — classification,
retention, deletion, export, consent, access logs, privacy policies, regional data rules — but are
silent on the DPDP Act, the legal entity, a grievance officer and retention periods. This document
fills that gap for the customer app.

---

## 1. The short version

- **What we are under the Act.** The company that runs One Local decides why and how customers'
  personal data is used, so it is a **Data Fiduciary**; each customer is a **Data Principal**.
  Supabase, Razorpay, the SMS provider and Google Maps process data for us: they are **Data
  Processors**, and we stay responsible for what they do (s.8(1)). We are very unlikely to be named
  a *Significant* Data Fiduciary (that is by government notification, for large or sensitive
  processing), so the extra duties of s.10 (a Data Protection Officer based in India, audits,
  impact assessments) probably do not apply yet.
- **When it bites.** The Rules were notified in November 2025 with an 18-month run-in. As we read
  them, almost every duty that matters to us applies from **about 13 May 2027**; Consent Managers
  can register from about 13 November 2026. Section 2 has the table.
- **Penalties are large.** Up to ₹250 crore for failing to keep data safe, up to ₹200 crore each for
  not reporting a breach or for breaking the children's rules, up to ₹50 crore for most other
  failures (Schedule to the Act). The Data Protection Board decides the amount case by case.
- **What the app now does (built 27 September 2026).** A full, itemised privacy notice; consent at
  sign-in with an "I am 18 or older" confirmation and an unticked, optional marketing box; a
  Privacy & your data screen where optional consents are switched on and off (every change
  recorded with its time and the notice version); download of everything we hold; correction;
  account deletion that erases what it can and keeps only what the law requires, unlinked from the
  person; nomination; grievances with a reference number and a 90-day answer promise. Server
  actions are signed-in only, rate-limited and audit-logged without personal data. Section 7 maps
  the code.
- **What only the founder can do.** Fill the legal entity, the grievance officer and the Board's
  complaint link (one file: `frontend/constants/privacy.ts`); approve the retention periods
  (section 5); decide whether account deletion may delete the login itself (section 7.3); approve
  migration 0027; have a lawyer review the notice and this map. Section 8 lists every open item.

## 2. Phased commencement (as we understand it — confirm with a lawyer)

| When | What comes into force | What it means for One Local |
| --- | --- | --- |
| 11 Aug 2023 | The Act receives Presidential assent. Nothing in force yet. | — |
| ~13–14 Nov 2025 | The Rules are published. Immediately in force: definitions, and the provisions that set up the **Data Protection Board** (Rules 1, 2, 17–21 and the Board sections of the Act). | The Board exists and is being staffed; no customer-facing duties yet. |
| ~13 Nov 2026 (12 months) | **Consent Managers** can register with the Board (Rule 4, First Schedule; s.6(9)). | A customer may start managing consents through a registered Consent Manager. We must be able to accept consent and withdrawals that arrive that way (not built; section 3.13). |
| ~13 May 2027 (18 months) | **Everything else**: notice (Rule 3), consent and withdrawal, security safeguards (Rule 6), breach intimation (Rule 7), erasure and retention (Rule 8), published contact (Rule 9), children (Rules 10–12), rights and grievance periods (Rule 14), cross-border (Rule 15), and the Board's power to penalise. | The deadline for every item in section 3. Build now so the next ~7 months go to review, not rework. |

Also relevant, and **already in force** (separate laws, not the DPDP Act): CERT-In's 2022 directions
(report certain cyber incidents to CERT-In within 6 hours of noticing them, keep system logs for
180 days in India), GST record-keeping (CGST Act s.36: 72 months from the due date of the annual
return), income-tax books (generally 6 years), and the IT Act's "reasonable security practices"
(s.43A and its 2011 rules) until the DPDP Act replaces them.

## 3. Duty by duty

Owners: **Founder** (business and legal decisions), **Lawyer** (review), **Engineering** (this repo),
**Grievance officer** (a named person who answers customers; can be the founder at first),
**Master team** (the OS repo, Repo-1-, which owns the migration ledger and the admin console),
**VINII POS owner** (restaurant order copies in the POS tables).

### 3.1 Notice — s.5, Rule 3
- **The law asks:** before or when asking for consent, a notice that stands on its own, in clear and
  plain language, with an itemised list of the personal data and the purpose of each, how to
  withdraw consent, how to use your rights, and how to complain to the Board. The person can ask
  for it in English or any language in the Eighth Schedule to the Constitution.
- **We now do:** `/privacy-notice` lists each data item with its purpose, whether it is needed or
  optional, and how long it is kept; who it is shared with and where; how to withdraw; the rights;
  what the law makes us keep; children; security; the grievance officer; the Board. It shows a
  version and date. Sign-in shows a one-line notice with a link to it. All facts come from one file,
  `frontend/constants/privacy.ts`, so they are filled once.
- **Missing:** the placeholders (legal entity, address, grievance officer, the Board's complaint
  link, SMS provider); a lawyer's review; Marathi and Hindi versions (today the notice offers them
  on request).
- **Owner:** Founder (facts), Lawyer (review), Engineering (translations once the text is final).

### 3.2 Consent — s.6(1)–(3), s.6(10), s.7(a)
- **The law asks:** consent must be free, specific, informed, unconditional and unambiguous, given
  by a clear affirmative action, and limited to the data needed for that purpose. We must be able to
  prove notice and consent (s.6(10)). Data a person gives voluntarily for a specific purpose (an
  address to deliver an order) can be used for that purpose without a separate consent, as a
  "legitimate use" (s.7(a)), as long as they have not said no.
- **We now do:** only what an order needs is required. Marketing, personalised suggestions and
  silent use of location are separate, optional and **off until switched on**; the sign-in marketing
  box is unticked. "Offers near me" on the You tab now starts off for new installs. Every choice is
  recorded with the time, the notice version and where it was made (sign-in or the privacy screen),
  on the phone first and then append-only on the server (`ol_consents`, migration 0027). Sign-in
  records that the notice was acknowledged and that the person confirmed they are 18 or older.
- **Missing:** migration 0027 is not applied, so today consents stay on the phone and are re-sent
  once it is. Existing installs keep whatever "Offers near me" setting they had (it was on by
  default); when marketing messages start, send only to people whose `ol_consent_current` row
  says `marketing = true`. The "Offers near me" switch on the You tab should become a view of the
  marketing consent (that screen was out of scope here).
- **Owner:** Engineering; Founder to approve 0027.

### 3.3 Withdrawal as easy as giving — s.6(4)–(6)
- **The law asks:** withdrawing must be as easy as giving; after withdrawal we and our processors
  stop within a reasonable time; what was done before stays lawful.
- **We now do:** each optional consent is one switch in Privacy & your data (the same single tap
  that gave it). Withdrawing marketing also switches off "Offers near me". Withdrawing location stops
  the location screen reading the phone's last known position (`knownPoint` in `src/places.ts`).
- **Missing:** no marketing or personalisation system exists yet; whichever is built must read the
  current consent before every send or use, and pass withdrawals on to any messaging provider.
- **Owner:** Engineering.

### 3.4 Purpose limitation and data minimisation — s.4, s.6(1), s.8(7)
- **The law asks:** use data only for the purpose it was given for, collect only what is needed.
- **We now do:** the notice ties each item to one purpose. Card, UPI and bank details never reach
  us (Razorpay's page takes them). The server stores only a hash of the device key. The data
  download leaves out internal keys. Voice and photo search (which would send audio and images to
  an AI provider) is switched off.
- **Missing:** rider phone numbers on orders, and restaurant order copies in the POS (`orders`
  table with `customer_name`, `customer_phone`), are outside this app's control. When AI search is
  switched back on, add it to the notice first and make sure the provider does not keep inputs.
- **Owner:** Engineering; VINII POS owner.

### 3.5 Accuracy — s.8(3), s.12
- **The law asks:** keep data complete, accurate and consistent where it is used to make a decision
  about the person or is shared; let them correct and update it.
- **We now do:** "Correct my details" opens profile editing; "Ask us to correct something else"
  creates a correction request (`CR-` reference) for things they cannot edit themselves (an old
  order, the sign-in email).
- **Missing:** a support screen in the Master to work through correction requests; profile and
  addresses still live on the phone (moving them to `shoppers` / `ol_addresses` is step 4 of
  `docs/PLATFORM_FOUNDATIONS.md`, and the download and erasure must then include those tables).
- **Owner:** Master team; Engineering.

### 3.6 Reasonable security safeguards, including logs — s.8(4)–(5), Rule 6
- **The law asks:** reasonable security safeguards to prevent a breach, at least: encryption,
  obfuscation or masking; access control; logs and monitoring to spot unauthorised access; backups
  so processing can continue after a compromise; keeping logs (and the data they relate to) for
  **one year**; contracts that make processors keep data safe.
- **We now do:** phones never read or write the database directly: every `ol_*` table has row-level
  security on with no public policies, and only the server holds the service key. Traffic is HTTPS;
  Supabase encrypts data at rest. Device keys and access tokens are stored as hashes on the server.
  Privacy actions write an audit line with a one-way tag of the account, the reference and counts,
  never names, numbers, addresses or messages (`frontend/server/privacy.ts`). Rate limits on every
  privacy route. Backups were taken before production changes (`scripts/db.py snapshot`).
- **Missing:** central log storage kept for one year (today server logs live wherever the API is
  hosted, for as long as that host keeps them); an access-log review routine; the shared
  `audit_log` table (Master plan, `PLATFORM_FOUNDATIONS.md`); written data-processing terms with
  each processor (Supabase, Razorpay, SMS provider, Google); a documented backup-and-restore test;
  two-step login for anyone with production access; the per-process rate limiter should move to
  the shared Redis limiter.
- **Owner:** Engineering (logs, limiter), Founder (processor contracts), Master team (`audit_log`).

### 3.7 Breach intimation — s.8(6), Rule 7
- **The law asks:** on becoming aware of a personal data breach, tell **each affected person**
  without delay (what happened, when, likely consequences, what we are doing, what they can do,
  who to contact) and tell the **Board** without delay, then send the Board a detailed report
  **within 72 hours** (facts, cause, mitigation, who caused it if known, steps to prevent it again,
  and the notices sent to people).
- **We now do:** the runbook in section 6; the notice promises to tell people and the Board.
- **Missing:** a named incident lead and deputy; a tested way to message all affected customers
  (SMS or email provider); CERT-In reporting contact details.
- **Owner:** Founder (names), Engineering (messaging, evidence).

### 3.8 Erasure when the purpose is served — s.8(7)–(8), s.12(3), Rule 8, Third Schedule
- **The law asks:** erase personal data when consent is withdrawn or the purpose is no longer
  served, unless a law requires keeping it, and make processors erase it too. For some large
  platforms (e-commerce with 2 crore or more registered users in India) the Rules fix a period of
  3 years of inactivity, with a 48-hour warning before erasure; we are far below that size, but the
  general duty still applies.
- **We now do:** "Delete my account" erases or anonymises the person's rows at once (section 7.2)
  and keeps only what tax and payment law require, no longer linked to them. It waits while an
  order placed in the last day is still on its way. Guests can clear everything on the phone.
- **Missing:** the scheduled purge in section 5 (inactive accounts, old help requests, consent
  history after the proof period); deleting the login itself is off by default (section 7.3);
  erasure does not reach the POS copy of a restaurant order; Razorpay keeps its own records under
  its own obligations.
- **Owner:** Founder (retention periods), Engineering (purge job), VINII POS owner (POS copies).

### 3.9 Processors — s.8(1)–(2)
- **The law asks:** we stay responsible for processing done on our behalf; a processor may act for
  us only under a valid contract.
- **We now do:** the notice and the data download list who handles data, what and where.
- **Missing:** signed data-processing terms (most providers publish a standard one to accept);
  the SMS provider is not chosen yet (Supabase phone sign-in needs one, plus India's DLT
  registration).
- **Owner:** Founder.

### 3.10 Grievance redressal and a published contact — s.8(9)–(10), s.13, Rules 9 and 14
- **The law asks:** publish the business contact of a person who can answer questions about
  personal data (a DPO only for Significant Data Fiduciaries), name it in every reply to a rights
  request, run an effective grievance process, and publish how long it takes to answer (the Rules
  cap it at **90 days**). People must use it before going to the Board.
- **We now do:** "Raise a privacy grievance" creates a request with a `GR-` reference and an
  answer-by date 90 days out; the grievance officer's name, email, phone and hours show on the
  notice, the privacy screen, and in every server reply and the data download.
- **Missing:** the officer's details; a queue for them to work through (before 0027, requests land
  in the existing help-request table with reference `privacy:<ref>`; after 0027, in
  `ol_privacy_requests` with an `open` index by due date); a reminder before due dates.
- **Owner:** Founder (name), Grievance officer, Master team (queue screen).

### 3.11 Rights of the person — s.11 (access), s.12 (correction, erasure), s.14 (nominate)
- **The law asks:** on request, a summary of the personal data and what we do with it, and who we
  shared it with; correction, completion, updating and erasure; and the right to nominate someone
  to act after death or incapacity. The Rules ask us to publish how to make these requests and
  what identifier we need.
- **We now do:** download (everything on our servers plus what is on the phone, as one JSON file,
  with an `EX-` reference); correction; deletion; nomination (`NM-` reference; a newer nomination
  replaces the older one); all from one screen, signed-in only so we know who is asking.
- **Missing:** a way for a nominee to act (today they would contact the grievance officer, who
  must verify them by hand); a way for a guest who never signed in to reach server data (they can
  sign in on the same phone, which links that phone's guest orders).
- **Owner:** Founder (verification policy for nominees), Grievance officer.

### 3.12 Children — s.9, Rules 10–12, Fourth Schedule
- **The law asks:** anyone under 18 is a child; processing their data needs the **verifiable consent
  of a parent**; no processing likely to harm a child's well-being; **no tracking, behavioural
  monitoring or targeted advertising directed at children** (some exemptions exist, none that fit
  a marketplace).
- **We now do:** accounts are for adults. Sign-in requires ticking "I am 18 or older" (never
  pre-ticked, recorded with the notice version); "Under 18?" explains that a parent or guardian uses
  their own account and that we do not track children or target ads at them. Browsing without an
  account needs no sign-in and collects nothing about the person.
- **Missing:** a self-declared age is the lightest possible check. If One Local ever wants
  under-18 accounts, it needs real verifiable parental consent (for example DigiLocker-backed age
  tokens, per Rule 10). Nothing stops a minor from ticking the box — the lawyer should confirm a
  declaration is reasonable for a grocery and food marketplace.
- **Owner:** Founder, Lawyer.

### 3.13 Consent Managers — s.6(7)–(9), Rule 4, First Schedule
- **The law asks:** a person may give, manage and withdraw consent through a Consent Manager
  registered with the Board (from about November 2026). We must honour consents and withdrawals
  that come that way.
- **We now do:** `ol_consents.source` already allows `consent_manager`.
- **Missing:** an integration once Consent Managers are live and their interface is published.
- **Owner:** Engineering (later), Founder (decide when).

### 3.14 Cross-border transfer — s.16, Rule 15
- **The law asks:** transfers abroad are allowed except to countries the government restricts by
  notification (none that we know of so far), subject to any requirements it sets.
- **We now do:** the database and sign-in are in Supabase's **Mumbai** region. The notice lists
  what may leave India: Google Maps queries, OpenStreetMap town-sized map areas (Europe; no name or
  phone), and the SMS provider once chosen.
- **Missing:** confirm the API host's region (Vercel or a container host; choose Mumbai), the SMS
  provider's region, and where Supabase support or backups may be accessed from.
- **Owner:** Founder, Engineering.

### 3.15 Significant Data Fiduciary — s.10, Rule 13
- Only if the government notifies us as one (large volume, sensitive data, risk to people). Then:
  a DPO based in India, an independent data auditor, yearly impact assessments and audits, and
  checks on algorithms. Not expected now; revisit at scale.
- **Owner:** Founder.

### 3.16 Duties of the person — s.15
- People must not impersonate others, suppress facts, or file false or frivolous complaints
  (penalty up to ₹10,000). The notice asks people to use our grievance process first; no other
  action needed.

## 4. Data inventory

Where: **Phone** = the app's storage on the customer's phone (AsyncStorage; browser storage on the
web). **DB** = the shared Supabase Postgres database, Mumbai region (`ap-south-1`), server access
only. **Auth** = Supabase Auth, same project and region. Retention is the proposal in section 5.

| Data item | Purpose | Where stored | Retention (proposed) | Shared with |
| --- | --- | --- | --- | --- |
| Name | Account, orders, reaching the customer | Phone (profile); Auth (`full_name` from Google or email sign-up); DB booking enquiries | Account life; erased on deletion | Store and rider for their order (when stores see names); Supabase |
| Mobile number | Sign-in code, contact about orders | Auth (phone sign-in); Phone (profile); DB booking enquiries | Account life | SMS provider (sign-in codes only); Supabase |
| Email | Sign-in, receipts | Auth; Phone (profile) | Account life | Supabase (sends auth emails) |
| Password | Sign-in | Auth, as a one-way hash (never readable) | Account life | Supabase |
| Profile photo, birthday, food preference, language | Personalising the app | Phone only | Until the person removes it or clears the phone | Nobody |
| Saved addresses with map points | Delivery | Phone only (moving to `ol_addresses` later) | Until removed | Nobody until used on an order |
| Delivery address, map point and rider notes on an order | Delivering that order | DB `ol_orders.delivery_address` | 1 year after delivery, then removed (order kept for tax, without it); at once on account deletion | The store and the rider for that order; Supabase |
| Current location / chosen place | Showing what we offer nearby | Phone only; the server receives a position to answer the coverage and nearby lists but does not store it | Until changed | Google Maps (address search, when on); OpenStreetMap (a town-sized area, no identity) |
| Orders: items, amounts, taxes, coupon, store, status | Fulfilment, billing, refunds, GST records | DB `ol_orders`, `ol_order_items`, `ol_checkouts` | 72 months from the due date of that year's GST annual return; unlinked from the person on deletion | The store (its own order); VINII POS for restaurant orders (POS `orders` has customer name and phone) |
| Payment metadata: Razorpay order and payment ids, method, status, paid time, failure reason | Confirming payment and refunds | DB `ol_checkouts` (and 0025 columns on `ol_orders`), `ol_payment_events` (ids only) | As long as the order (tax and payment reconciliation) | Razorpay (holds card, UPI and bank data under its own licence; we never see it) |
| Refunds | Money back | DB `ol_refunds` | As long as the order | Razorpay |
| Device key | Keeps guest orders private to a phone | Phone (raw key); DB stores only a SHA-256 hash as `customer_hash` | Until the app is removed or the phone is cleared | Nobody |
| Account hash | Links orders to an account | DB `customer_hash` (hash of the account id) | With the order; replaced by a random stand-in on deletion | Nobody |
| Sign-in session tokens | Staying signed in | Phone; Auth | Until sign-out / expiry | Supabase |
| Voice and photo search inputs | Finding products (AI) | Not stored; feature switched off | — | AI provider when switched on (must be added to the notice first) |
| Help requests (support messages) | Answering the customer | DB `ol_support_requests` | 2 years after closing, then deleted; at once on account deletion (message replaced) | Supabase |
| Booking enquiries (name, phone, event, date) | Answering the enquiry | DB `ol_booking_enquiries`; Phone copy | 1 year after the event date; deleted on account deletion | The venue, when bookings go live |
| "Launch here" requests | Counting demand per town | DB `ol_support_requests` (reference `launch:<place>`) | Kept unlinked (a town, not a person) | Nobody |
| Consent choices | Proof of consent (s.6(10)) | Phone; DB `ol_consents` (0027) | Account life + 3 years (proof), then purged | Nobody |
| Privacy requests (download, erasure, correction, nominee, grievance) | Answering rights requests, proving we did | DB `ol_privacy_requests` (0027), before that `ol_support_requests` as `privacy:<ref>` | 3 years after closing | Nobody |
| Nominee's name, relationship, phone or email | Acting for the person after death or incapacity | DB `ol_privacy_requests.details` | Until replaced or the account is closed + 3 years | Nobody |
| Wishlist, cart, followed stores, recent places, reel likes | App features | Phone only | Until the person clears them | Nobody |
| Server logs (requests, errors, the privacy audit line) | Security and debugging | API host logs (host not final) | 1 year (DPDP Rules) and 180 days in India (CERT-In) | API host |
| Restaurant partner devices' push tokens | Order alerts to restaurants (not customers) | DB `ol_partner_devices` | While the device is registered | Expo push service (US) |

## 5. Retention schedule (proposal — the founder decides, the lawyer and accountant confirm)

| Record | Keep for | Then | Why |
| --- | --- | --- | --- |
| Account (login, name, phone, email) | While the account is used; after **3 years** with no sign-in and no order, warn 48 hours ahead, then delete | Delete the login and anonymise as in erasure | Mirrors the Rules' Third Schedule period for large e-commerce, a sensible default for us too |
| Delivery address and notes on an order | **1 year** after delivery (covers disputes, refunds, chargebacks) | Remove from the order; keep the order for tax | Only needed to deliver and to settle disputes |
| Orders, order lines, checkouts, amounts, taxes | **72 months** from the due date of that year's GST annual return (CGST Act s.36; confirm with the accountant; income-tax books similar) | Delete, or keep only anonymous totals | Tax law |
| Payment references and refunds | Same as the order they belong to | As above | Tax and payment reconciliation; RBI rules bind Razorpay, not us |
| Help requests | **2 years** after closing | Delete | Long enough for repeat issues and disputes |
| Booking enquiries | **1 year** after the event date | Delete | No further purpose |
| Consent history | Account life + **3 years** | Purge (the migration's purge switch) | Proof of consent (s.6(10)); 3 years is a common limitation period — lawyer to confirm |
| Privacy requests and grievances | **3 years** after closing | Delete | Proof we answered |
| Security and audit logs | **1 year** (DPDP Rules), at least 180 days kept in India (CERT-In) | Delete | Law |
| On-phone data | Until the person clears it, signs out and clears, or deletes the account | — | The person controls it |
| Backups | Rolling **30 days** | Overwritten | Erased data must disappear from backups within the backup cycle |

None of these purges runs yet: they need a scheduled job (Master cron or Supabase `pg_cron`), which is
section 8's item 6.

## 6. Breach-response runbook

A **personal data breach** is any unauthorised processing, or accidental disclosure, access,
change, loss or destruction of personal data that compromises its confidentiality, integrity or
availability. A leaked service key, a public storage bucket holding customer data, a lost laptop
with a database backup, or a wrong customer's order shown to someone else all count.

**Who**

| Role | Who (founder to fill) | Does |
| --- | --- | --- |
| Incident lead | [FOUNDER TO FILL] | Decides, owns the clock, signs off every message |
| Deputy | [FOUNDER TO FILL] | Takes over if the lead cannot be reached within 1 hour |
| Engineering | [FOUNDER TO FILL] | Contains, preserves evidence, finds scope |
| Grievance officer | as in `constants/privacy.ts` | Answers customers' questions afterwards |
| Lawyer | [FOUNDER TO FILL] | Reviews the Board notice and customer message |

**What, within what time** (the clock starts when anyone at One Local becomes aware)

| When | Step |
| --- | --- |
| 0 – 1 hour | **Contain.** Rotate exposed keys (Supabase service role, Razorpay, Maps); revoke sessions (Supabase: sign out all users if accounts are affected); close the hole (switch the feature off with `FEATURE_*=off`, take the route down, make the bucket private). **Preserve evidence**: keep logs, take a database snapshot (`scripts/db.py snapshot`), write down times. Tell the incident lead. |
| 1 – 6 hours | **Scope.** Which tables and fields, how many people, since when, is it still happening. Use the privacy audit lines and API logs; `customer_hash` / `user_id` to find the people. **CERT-In**: if it is a reportable cyber incident, report to CERT-In **within 6 hours** of noticing (separate law, already in force). |
| As soon as the basic facts are known ("without delay") | **Tell the Board** (initial intimation): what happened, extent, timing, location, likely impact. **Tell each affected person** (SMS or email, plus an in-app notice): what happened and when, what data, likely consequences, what we are doing, what they should do (for example watch for fake calls asking for OTPs; we never ask for an OTP), and who to contact (the grievance officer). Plain language; no blame; no minimising. |
| Within 72 hours of becoming aware | **Detailed report to the Board**: updated facts, circumstances and reasons, mitigation, findings about who caused it, what we changed so it cannot happen again, and copies of the notices sent to people. If more time is truly needed, ask the Board in writing before the 72 hours run out. |
| Within 2 weeks | **Fix the cause** for good and review: what failed, what changes (code, access, processes). Add the lesson to this runbook. Tell processors involved (Supabase, Razorpay) and check theirs. |

**Message to affected customers (template)** — "On [date] we found that [what happened]. It affected
[which details] of some One Local customers, including you. [What it means for you.] We have
[what we did]. We suggest you [steps]. We never ask for your OTP, PIN or password. Questions: [grievance
officer name, email, phone]. Reference: [incident id]."

**Evidence to keep**: timeline, logs, snapshots, the list of affected people (kept apart, access
limited), copies of every notice, and the Board's acknowledgements — for at least 1 year.

## 7. What was built (27 September 2026)

### 7.1 Screens and phone storage

| Where | What |
| --- | --- |
| `frontend/constants/privacy.ts` | The one config: notice version and date, legal entity, address, grievance officer, response days (90), Board link, minimum age, consent purposes, the itemised "what we collect", "shared with", and "kept by law". Imported by both the app and the server. |
| `frontend/app/privacy-notice.tsx` | `/privacy-notice`: the itemised notice. Placeholders show highlighted, with a "draft" banner until filled. |
| `frontend/app/privacy.tsx` | `/privacy` (Privacy & your data, linked from the You tab): consent switches with the last change's time and notice version; download; correct (profile edit, or a correction request); nominate; grievance; read the notice; what is stored on this phone; clear it (guests); delete my account with a confirm sheet listing what is deleted and what is kept. |
| `frontend/app/sign-in.tsx` | Notice line and link, "I am 18 or older" (required, never pre-ticked), optional unticked marketing box, "Under 18?" explanation. Choices recorded before sign-in completes. |
| `frontend/src/privacy.ts` | Consent choices on the phone (`onecity.privacy.v1`), sent to the server after sign-in and re-sent until accepted; picks up choices made on another phone; the list of every key the app stores; the download file (server data + phone data; device key and session never included); clearing the phone. |
| `frontend/src/places.ts` | Reading the phone's last known position without asking now needs the location consent. |
| `frontend/src/customer.tsx` | "Offers near me" starts off; `reset()` for clearing and deletion. |
| `frontend/src/auth.tsx` | After sign-in, sends and pulls consent choices. |

### 7.2 Server

| Route | Does | Limit |
| --- | --- | --- |
| `GET /api/privacy/export` | Account (from Supabase Auth with the person's own token), orders, checkouts, refunds, help requests, launch requests, booking enquiries, consents, privacy requests; plus what we collect, who we share with, what the law keeps. Internal keys left out. Rows = linked to the account, or placed from this phone before signing in (what My Orders already shows). | 5 per hour |
| `GET /api/privacy/consents` | Newest choice per purpose. | 60 per hour |
| `POST /api/privacy/consents` | Appends up to 20 choices; validates purpose, notice version and source; the age and notice declarations can only be confirmed. | 30 per hour |
| `POST /api/privacy/erasure` | Needs `{ "confirm": "DELETE" }`; refuses while an order from the last day is on its way. Deletes booking enquiries; replaces help-request messages; removes delivery addresses from orders; gives orders and checkouts a random stand-in owner (amounts, taxes, items and Razorpay references stay); unlinks refunds and launch requests; withdraws optional consents; ends every session (Supabase global sign-out); records an `ER-` request with the outcome. | 3 per day |
| `POST /api/privacy/grievances` | Grievance (`GR-`) or correction (`CR-`), 10–2,000 characters, answer-by date 90 days out, grievance contact in the reply. | 5 per day |
| `POST /api/privacy/nominee` | Name, relationship, and a phone or an email (`NM-`). | 5 per day |

All are signed-in only (a Supabase access token; a device key alone is refused), use the same
`route` / `HttpError` / `limit` helpers as the rest of the API, and work with no database (memory
mode). Every action writes one `[privacy]` audit line: event, a 12-character one-way tag of the
account, reference, counts. No names, numbers, emails, addresses, messages, account ids or tokens.
`frontend/scripts/privacy-checks.ts` proves this (56 checks: `npx tsx scripts/privacy-checks.ts`).

Before migration 0027 is applied: consents stay on the phone (the server answers `phone_only`, the
phone re-sends later); grievances, corrections, nominations and erasure records go to the existing
help-request table with reference `privacy:<ref>` so the team sees them; downloads are logged only.

### 7.3 Deleting the login itself: `PRIVACY_HARD_DELETE` (off by default)

Erasure always removes the person's details from One Local's own tables and signs them out
everywhere. Deleting their **Supabase Auth user** is implemented but only runs when the server has
`PRIVACY_HARD_DELETE=on`, a database connection, and the person has **no other membership**
(`org_users`, `riders`, `platform_admins`). Why it is off:

1. **One login serves every Proviyaa app** (D1 in `PLATFORM_FOUNDATIONS.md`). The same person may be
   a restaurant's staff member in VINII POS or a rider; deleting the login from the customer app
   would lock them out of work. The membership check guards the known tables, but new apps may add
   more.
2. **Other apps' rows point at the login.** Deleting it sets or cascades foreign keys in tables One
   Local does not own, which the shared-database rules forbid us to change without their owner
   (rule 6, "never hard-delete people that orders reference", rule 7).
3. **It cannot be undone**, and it needs the service-role key's admin power.

With it off, the erasure request is marked `partially_completed` with `login: kept_for_review`, and
the team deletes the login by hand (Supabase dashboard) within the response period after checking
other apps. Switch it on once the founder and the Master team agree, ideally when the Master owns
account deletion across apps.

### 7.4 Database (draft, not applied)

`db/migrations/0027_ol_privacy.sql`: `ol_consents` (append-only by trigger; deletes only by the
retention purge, which sets `ol.privacy_purge`), `ol_consent_current` (newest choice per person
and purpose), `ol_privacy_requests` (kind, status, reference, details, due date, resolved date).
RLS on, no policies, server only, like every `ol_` table. The number is a placeholder: the OS repo
ledger assigns the real one.

## 8. What the founder must decide or fill

1. **Legal entity and registered address** — fill in `frontend/constants/privacy.ts`.
2. **Grievance officer** — name, email, phone, hours (same file). Can be the founder at first; must
   answer within 90 days, ideally much sooner.
3. **The Board's official complaint link** — once confirmed (same file).
4. **Retention periods** — approve or change section 5; confirm the tax periods with the accountant.
5. **Deleting logins** — keep `PRIVACY_HARD_DELETE` off (team deletes by hand) or switch it on.
6. **Purge job** — approve a scheduled job to apply section 5 (after 0027).
7. **Migration 0027** — approve, and have the OS repo ledger give it a number.
8. **Processor contracts** — accept data-processing terms from Supabase, Razorpay, Google and the
   SMS provider; choose the SMS provider.
9. **Breach team** — name the incident lead, deputy, engineer and lawyer (section 6).
10. **Lawyer review** — of this map, the notice text, the 18+ self-declaration, and the timeline.
11. **Nominee verification** — how the team checks that a nominee is who they say (death
    certificate, ID) before acting.
12. **Existing installs** — "Offers near me" was on by default before today; decide whether to
    switch it off for everyone until they say yes (recommended before any marketing send).

## 9. Risks and known gaps

- **Not applied**: without 0027, consent evidence lives only on phones; a lost phone loses unsent
  choices. Apply 0027 before any marketing starts.
- **Login deletion is manual** while the flag is off: a request could be missed. The `ER-` request
  (or `privacy:ER-…` help request) is the to-do; the Master needs a queue sorted by due date.
- **Restaurant orders** also live in the POS `orders` table (customer name and phone), owned by
  VINII POS; erasure here does not reach them. Needs a contract function from the POS owner.
- **Profile and addresses live on the phone**: when they move to `shoppers` / `ol_addresses`, the
  download and erasure must include those tables (a one-line addition to each query list in
  `server/privacy.ts`).
- **Rate limits are per server process** and reset on restart; they move to the shared Redis
  limiter with the rest of the API.
- **Age is self-declared.** Acceptable only if the lawyer agrees for this kind of service.
- **Shared phones**: a person signed in on someone else's phone sees and can delete that phone's
  guest orders (as My Orders already shows them). Documented; low harm because amounts are kept.
- **Download size**: on phones the file is shared as text through the share sheet; very long order
  histories may be slow. A file-based share needs a native module (next native build).
- **Nothing was tried on a real phone or with a real account in this session**: the server logic is
  covered by the checks script with sign-in simulated; the screens were checked in a web browser as
  a guest.
