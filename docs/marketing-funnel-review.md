# Marketing funnel review — September 29, 2026

Implemented in the marketing website repository on `codex/marketing-funnel-improvements`. This document records the implementation and pre-publication validation. No app/backend, checkout, billing, App Check enforcement, or secret changes.

## Phase 0 — Give pricing visitors a real next step

**Decision:** retain the waitlist approach. Replace disabled buttons and dormant web checkout UI with plan-specific launch links and an inline form. Capture an allowlisted `selectedPlan` with the lead. Keep enterprise contact available.

**Funnel refinement:** selecting a plan signals intent; asking a visitor to create an account before access is available adds friction without delivering value. Reference prices remain visible, while launch access and final purchase terms are explicit. A free signup does not reserve a price or guarantee access. Removed “most popular,” since no supporting plan adoption data was supplied. No “price for life” promise was added.

Properties and rental units are explicitly distinguished rather than treating them as interchangeable when recommending a tier.

## Phase 1 — Remove broken and misleading conversion paths

- Scope shared fixed positioning to the main header; leave footer navigation in normal flow. Keep the logo and primary action visible on phones.
- Open the full audit before asking for contact details. Show the workload model's actual assumptions and distinguish the value of time from realized cash savings. The audit models up to 50 units and says so.
- Offer an optional follow-up form after the results, with portfolio size prefilled from the calculator. This avoids withholding value or asking a visitor to repeat their work.
- New landlord forms require only email and unit range. Keep empty name strings in the payload for compatibility with existing Firestore required keys; no backend rule change is required by the checked-in rules.
- Mark a conversion only after Firestore acknowledges the write. Missing Firebase or rejected saves remain failures with a retry path. Disable repeat submission after success.
- Render successful saves before confirmation email on every signup flow. Missing EmailJS, synchronous errors, or rejected email sends do not turn a saved lead into a failed signup.
- Add `robots.txt` with the existing canonical sitemap URL.

**Refinement from the supplied plan:** the full audit stays open. A second gate after showing a teaser would reintroduce friction, especially for visitors arriving from educational articles.

## Phase 2 — Build a landlord-first homepage

The homepage is now approximately 713 visible words instead of the previous roughly 2,400. HTML decreased from 86,221 to about 11,000 bytes. Home styling lives in the shared stylesheet; there is no duplicate inline nav rule.

The sequence is: landlord workload → free audit or plans → short launch form → three concrete workflows → illustrative cost comparison → Section 8 context → landlord FAQ → final signup action.

Removed the scrolling ticker, internal system counts, unrelated role pitches, partner-style name drops, premature app promotion, exaggerated manager comparisons, unverified savings claims, lifetime price promises, and urgency without evidence. Existing tenant, merchant, provider, and campaign pages retain their role journeys; `/join/` provides the role directory. Old `/landlords/` and `/download/` redirects remain.

**Refinement:** software is positioned as support for hands-on owners rather than a universal replacement for every service of a property manager. The cost example is transparent arithmetic ($1,500 × 10% × 12), not a national rent claim or an assurance of savings.

## Phase 3 — Use evidence, not invented proof

Per the user's September 29 direction, omit the founder story, partnership claims, and landlord count until the user writes them. No fabricated logos, customer testimonials, urgency counters, or simulated app screenshots were added.

Tenant messaging now leads with rental reputation, learning, and eligible reporting. Promotional PTI credits are explicitly separate from campaign cash earnings and cannot be withdrawn as cash. Credit increases and campaign earnings are not promised. Renter articles with PTI reward language also receive clarification beside their next-step action.

A future proof update can use user-approved founder material and genuine app screenshots; it is not required to publish these functional improvements.

## Phase 4 — Connect the resource library to the right journey

All 152 articles are preserved. Improvements include:

- Cleaner titles, with individual rewrites where long headlines needed an editorial decision; concise descriptions without cutting words mid-sentence.
- A 1200×630 branded sharing card for each article plus a site-wide default. These are editorial title graphics, not product screenshots. No generated illustration is being presented as evidence.
- Open Graph/Twitter image metadata and alt text, breadcrumb JSON-LD and visible breadcrumbs.
- Article author/date metadata, preserving existing data and using the existing blog index for missing publication dates. No invented publish dates or blanket “updated today” dates.
- Nine topic hubs linked from the resource index and sitemap, plus three related articles per post.
- Role-appropriate header and article actions: landlords → audit; renters → tenant access; merchants, providers and brands → their own forms.
- Standard article navigation, case-correct logo paths, repaired internal URLs and anchors, and updated legacy scroll handlers for the new header ID.
- Practical workflow sections on nine short articles: property records, software evaluation, campaign briefs, inquiry qualification, and local offer testing. The audit found more short pages than the supplied plan. Content was added to answer a reader's next question rather than repeat keywords.

**Refinements:** Google does not impose a 60-character title limit or a minimum article word count. Keep the core query and city intact; avoid mechanical truncation. The sharing cards solve social presentation now. Additional in-body photography can be commissioned later when it adds explanatory value.

Google references: [title links](https://developers.google.com/search/docs/appearance/title-link), [article structured data](https://developers.google.com/search/docs/appearance/structured-data/article).

Existing legal, market, and statistical claims in older article bodies were not comprehensively fact-checked as part of this funnel/SEO change. Do not treat structural checks as factual certification.

## Phase 5 — Measure conversion quality, not raw totals

The shared tracker emits:

| Event | Trigger | Context |
| --- | --- | --- |
| `form_seen` | Form enters the viewport, once per page load | `form_id`, `page_path` |
| `form_started` | First input/change, once per form | `form_id`, `page_path` |
| `signed_up` | Confirmed successful database write | `form_id`, `page_path`, selected plan on new forms |
| `funnel_cta_clicked` | Relevant internal CTA click | destination path, page path, selected plan when present |

Custom events do not include email, names, field contents, full URLs, or query strings. Analytics failures cannot block a signup. Existing role-specific conversion names remain for continuity; use `signed_up` as the new consolidated measure to avoid adding duplicate event families together.

After publication, verify events in GA4 DebugView/Realtime and register event-scoped dimensions for `form_id`, `page_path`, `plan`, and `destination_path` if needed. These account-side settings were not changed.

At the two-week review, compare **starts / views** and **saved signups / starts** by page, audience, source and device. For low traffic, keep collecting before declaring a winner. Ten historical signups alone are not a valid conversion-rate baseline without traffic and date denominators. This work does not schedule an automatic follow-up.

## Validation and release

- `python3 scripts/check-site.py`: parses all 177 HTML pages; checks internal paths/anchors, all 152 article metadata sets, sharing assets, JSON-LD, unique sitemap entries and article coverage.
- `node scripts/test-funnel.cjs` with Playwright installed and a local HTTP server: desktop/mobile previews, visible navigation, immediate audit, interactive calculations, plan handoff, saved/failed submissions, unavailable Firebase, blocked EmailJS, and scrolling article headers. External requests are intercepted; no real leads or email are sent.
- `python3 scripts/build-social-cards.py` with Pillow regenerates share images. Set `PTI_CARD_FONT` to a bold TrueType font when the macOS default is unavailable.
- `git diff --check` and JavaScript syntax checks before delivery.

Live Firebase/App Check, EmailJS delivery, GA4 ingestion, and social-crawler refresh still require verification on the published domain. Browser checks use mocked external services; they do not certify production delivery. Publication is tracked through the feature branch pull request into `main` and the GitHub Pages deployment.
