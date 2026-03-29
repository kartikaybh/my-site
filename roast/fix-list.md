# Prioritised Fix List

---

## P0 — Launch Blockers
*Fix before deploying. These actively damage credibility or break core functionality.*

### P0-1: No mobile navigation
**Problem:** At 480px, `nav-links { display: none; }` hides all links with no hamburger replacement. Mobile visitors have zero way to navigate.
**Fix:** Add a hamburger toggle with a slide-down or full-screen mobile menu.
**Raised by:** Marcus, confirmed by all.

### P0-2: Placeholder testimonials
**Problem:** "PSU Client," "Government Client," "Political Campaign" are obviously placeholder names. For institutional clients reading this, it signals either no real relationships or hidden ones. Either way, trust drops.
**Fix:** Replace with real testimonials (even just first name + department type), OR remove the section entirely and replace with a "Selected Work" or "Clients I've worked with" section using sector/geography descriptions.
**Raised by:** Meera, Rohit, Shreya.

### P0-3: Contact email domain unverifiable
**Problem:** `hello@kartikay.com` — kartikay.com either doesn't exist or isn't live. A government client who tries to look up the domain gets nothing. Either use a verified domain email or use a Gmail as a temporary placeholder.
**Fix:** Ensure the email domain resolves to something, or change to a working email address.
**Raised by:** Shreya.

---

## P1 — Important
*Fix before or shortly after launch. These meaningfully affect conversion and trust.*

### P1-1: No WhatsApp or phone contact
**Problem:** Kartikay's primary service is WhatsApp Marketing, yet the only contact method is a web form. Government and institutional clients call or WhatsApp — they don't fill in forms.
**Fix:** Add a WhatsApp button (wa.me link) prominently in the contact section. Add a phone number if comfortable.
**Raised by:** Ankit, Meera.

### P1-2: Duplicate CTA labels
**Problem:** "Work with me" (hero) and "Start a conversation" (CTA banner) both link to `#contact`. Inconsistent messaging weakens both.
**Fix:** Pick one label — "Work with me" is stronger and more direct — and use it everywhere.
**Raised by:** Marcus, Ankit.

### P1-3: Hero CTA likely below fold on small laptops
**Problem:** The hero name is `clamp(72px, 12vw, 158px)` and the section is `min-height: 100vh` with 120px top padding. On 13" laptops the CTA button is likely not visible without scrolling.
**Fix:** Reduce hero name size at mid-range breakpoint (1024px), or reduce top padding so the CTA is visible above the fold.
**Raised by:** Marcus.

### P1-4: Stats section missing `.container` wrapper
**Problem:** `.stats-grid` is full-bleed with no max-width container. On ultrawide monitors (2560px+) the stats will stretch to absurd widths.
**Fix:** Wrap `.stats-grid` in a `.container` div, or add `max-width: var(--max-width)` and `margin: 0 auto` directly to `.stats-grid`.
**Raised by:** Marcus.

### P1-5: "360°" stat is not credible alongside real numbers
**Problem:** 10x and 100x are real, measurable results. "360°" is a marketing phrase — it quantifies nothing. Sitting next to real numbers it looks like padding.
**Fix:** Replace with a real number. Options: number of campaigns delivered, number of years Greynium has operated, number of government clients served, etc.
**Raised by:** Marcus, Rohit.

### P1-6: No social proof links
**Problem:** No LinkedIn, no Greynium website link, no external validation. For cold visitors this is a gap. For warm leads who want to share the site internally, there's nothing to send alongside it.
**Fix:** Add LinkedIn URL in the contact/footer section. Link to Greynium.com.
**Raised by:** Ankit, Rohit.

### P1-7: Greynium barely mentioned
**Problem:** Greynium.com appears once in the About section as a single sentence. If it's the business being built, it deserves its own positioning — even a line like "Founding Director, Greynium.com" under the name in the hero.
**Fix:** Either give Greynium a dedicated mention with a link, or make "Founder, Greynium.com" a visible credential near the top.
**Raised by:** Rohit.

---

## P2 — Nice to Have
*Improve post-launch. Won't block traction but will improve quality.*

### P2-1: Generic service copy
**Problem:** "Performance-led paid campaigns across digital platforms. Built to convert, not just to reach." and "Strategy first, execution second" are phrases every agency uses.
**Fix:** Rewrite each service with one specific detail only Kartikay could claim. E.g. for WhatsApp: "I've run WhatsApp campaigns during election windows where broadcast slots were unavailable — and it outperformed."
**Raised by:** Shreya, Ankit.

### P2-2: "Depth over flash, outcomes over optics, trust over tactics"
**Problem:** This triple-alliteration in the About section is the most AI-sounding line on the site. It's not how Kartikay talks.
**Fix:** Replace with a plain sentence that says the same thing in his voice. E.g. "I'd rather tell you something won't work than run a campaign I don't believe in."
**Raised by:** Shreya.

### P2-3: No case study or proof of methodology
**Problem:** The site claims results but offers no window into how they were achieved. Meera as a government client wants to know: what does an engagement actually look like?
**Fix:** Add a single anonymised case study block — brief, approach, result. Even 150 words transforms the credibility.
**Raised by:** Meera, Rohit, Ankit.

### P2-4: No government procurement signal
**Problem:** The site doesn't acknowledge that working with government involves procurement constraints, GeM, long payment cycles. Experienced government clients will notice the silence.
**Fix:** One sentence in the About or contact section: e.g. "Comfortable working within government procurement frameworks and payment timelines."
**Raised by:** Meera.

### P2-5: Font loading — no font-display: swap
**Problem:** Google Fonts without `font-display: swap` can cause invisible text (FOIT) during load on slower connections.
**Fix:** Add `&display=swap` to the Google Fonts URL (already partially done — verify it's applied to all weights).
**Raised by:** Marcus.

### P2-6: Contact form has too many fields
**Problem:** Name + Email + Organisation + Brief is four fields before any trust is established. Cold visitors won't complete it.
**Fix:** Reduce to three fields: Name, Email, Message. Organisation can be in the message.
**Raised by:** Ankit.

### P2-7: Form has no loading/processing state
**Problem:** After clicking "Send →" there's a JavaScript success state but no visual feedback during the (simulated) processing. On slow connections, users may click twice.
**Fix:** Add `btn.disabled = true` and change button text to "Sending…" immediately on click, before the success state.
**Raised by:** Marcus. *(Note: disabled is already set in the JS — ensure it happens before the delay, not after.)*

---

## Summary Table

| ID | Issue | Priority | Effort |
|---|---|---|---|
| P0-1 | No mobile nav | P0 | Medium |
| P0-2 | Fake testimonials | P0 | Low |
| P0-3 | Dead email domain | P0 | Low |
| P1-1 | No WhatsApp/phone CTA | P1 | Low |
| P1-2 | Duplicate CTA labels | P1 | Low |
| P1-3 | Hero CTA below fold | P1 | Low |
| P1-4 | Stats missing container | P1 | Low |
| P1-5 | 360° is not a real stat | P1 | Low |
| P1-6 | No LinkedIn/social links | P1 | Low |
| P1-7 | Greynium barely mentioned | P1 | Low |
| P2-1 | Generic service copy | P2 | Medium |
| P2-2 | AI-sounding triple in About | P2 | Low |
| P2-3 | No case study | P2 | High |
| P2-4 | No procurement signal | P2 | Low |
| P2-5 | Font-display: swap | P2 | Low |
| P2-6 | Form too many fields | P2 | Low |
| P2-7 | Form no loading state | P2 | Low |
