# One Local — what to build next, from the Swiggy and District studies

27 Sep 2026. Five specialist studies of the Swiggy app (seen on the founder's iPhone) and the earlier District teardown, each checked against our own code. Full studies, with file-and-line references and code sketches, are in `docs/research/swiggy-2026-09-27/`:

| File | Area |
| --- | --- |
| `00-observations.md` | What was seen in Swiggy, screen by screen (no personal data) |
| `01-ui.md` | Visual system: type sizes, cards, badges, prices, bars; exact theme tokens |
| `02-ux-flows.md` | Every step from first open to reorder, tap counts, the "discover-only town" path |
| `03-motion.md` | Scroll behaviour, micro-interactions, exact timings and springs |
| `04-profile-tickets.md` | Profile, order-first help, support tickets, event tickets; draft database changes |
| `05-images.md` | Image sizes, moving images off the Mac, a look for places with no photos |

Swiggy's Scenes (event tickets), Instamart and Dineout could not be seen through iPhone Mirroring; the event-ticket design leans on District.

## What we already do better — keep it

The server works out the bill (with GST) so a tampered cart is refused; the smart top-up that closes the free-delivery gap; the floating cart with its progress bar; department colour worlds; 44-point touch targets and reduced-motion support; photo search next to voice; no ad clutter; honest "sample" labels; guest orders that follow the customer after sign-in.

## The biggest gaps

1. **The new all-India server isn't used by any screen yet.** The app never sends a city, so everything is Latur; a map pin outside Latur is a dead end.
2. **Orders carry no delivery address.** The cart shows a fixed "10 min · Latur" line.
3. **First open asks for sign-in, never for location.**
4. **Text is too small** (7–10 pt in badges, tabs, address, search hint) and cards leave out rating and time even though the data exists.
5. **Scroll animation runs on the JavaScript thread**, so headers stutter when the app is busy; the header never comes back on scroll-up; the tab bar never hides.
6. **Production builds show no images**: every picture still streams from the founder's Mac.
7. **Nothing after delivery**: no rating, no reorder button, help isn't tied to an order.

## Build order

Each step is small enough to test on its own. Effort: S = hours, M = a day or two, L = several days.

| # | Step | Effort | Needs from the founder |
| --- | --- | --- | --- |
| 1 | **Location-first start**: ask where you are (or pick from all of India), check coverage, remember it; header shows "Place ▾ / District, State" | M | — |
| 2 | **Explore-town page** for places we don't deliver to: real local restaurants, grocers, shops and pharmacies with distance, call and directions; "Launch One Local here" | M | OK to show phone numbers from OpenStreetMap |
| 3 | **Scroll on the UI thread**: one driver for header, tab bar and floating cart; header returns on scroll-up; sticky filter chips | M | — |
| 4 | **Type scale and cards**: 11 pt minimum, product card with offer on the photo and ★ rating · time, store list row, badge set | M | — |
| 5 | **Address on the order**: address row in the cart, change it in place, saved with the order | M | — |
| 6 | **Sign-in only when Pay is tapped** | S | Sign-in method: email for now, or phone OTP |
| 7 | **Images to Supabase Storage** (public bucket `ol-media`), fit rules by image kind, one `<Photo>` component, no-photo look for listings | S–M | Approval to create the bucket (a production write); paid image resizing or fixed sizes |
| 8 | **Store page**: floating cart, pinned category chips, in-store search, "Want to repeat?", Items menu | M | One store per cart, or mixed? |
| 9 | **After delivery**: food and delivery ratings, reorder (replace or add), help on that order | M | — |
| 10 | **Order-first Help and My Refunds**, ticket statuses, auto-refund under a cap | M | Auto-refund cap; support hours to promise |
| 11 | **Savings corner and tip** | S | Is tipping allowed; defaults; 100% to rider? |
| 12 | **Event tickets**: shows, ticket types, holds, QR entry pass, My tickets | L | Pay at venue first or wait for online payment; default cancellation policy |

Online payments (UPI, cards, netbanking, wallets, pay later) are built and switched off until Razorpay test keys are set — see `docs/PAYMENTS.md`.

Database changes proposed by the studies (support tickets, ratings, event tickets) are drafts only. Like migration 0025 (payments), they go to the OS repository for numbering and are applied only with the founder's approval.

## Open questions for the founder

- Show phone numbers of local places from OpenStreetMap on explore-town pages?
- Tipping: allowed? defaults? all of it to the rider?
- One store per cart (like Swiggy Food), or mixed carts split into one order per store?
- Sign-in at checkout: keep email and password, or go to phone OTP now?
- Veg / non-veg mark: products need a "diet" field — who fills it for each product?
- Auto-refund cap for "item missing / wrong item" (suggested ₹200 for Food).
- Refunds for cancelled bookings: back to the payment method, or to wallet/coins?
- Book It: pay at the venue first, or wait for online payment?
- Default event cancellation policy (suggested: until 2 hours before, 75% back).
- Supabase image resizing is a paid feature; pay for it, or publish fixed sizes?
