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
