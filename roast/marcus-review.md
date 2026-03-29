# Marcus Tan — Product Designer Review

## Visual Hierarchy
The hierarchy is mostly solid. Hero name is massive and commanding. Section flow is logical. The gold-on-cream palette reads clearly. But there are a few places where the hierarchy breaks down or decisions feel arbitrary.

**Problems:**
- The `section-label` (gold uppercase, 12px) appears before every section — including sections that don't need orientation, like the CTA banner. It's become decorative repetition rather than navigation aid.
- The stats section has no container — `.stats-grid` bleeds edge-to-edge, but every other section uses `.container`. Inconsistent. On ultrawide screens this will look broken.
- The "360°" stat is misleading. "360 degrees" doesn't mean anything quantifiable. It reads like marketing fluff sitting next to two real numbers (10x, 100x). Weakens the whole block.

## CTAs
- There are **two CTAs** in close proximity: "Work with me" (hero) and "Start a conversation" (CTA banner). They go to the same place (`#contact`). The duplication dilutes both. Pick one phrase and own it.
- The form submit button says "Send →". Fine. But there's no visual feedback state beyond the JS success message — no loading state, no disabled state during submission. On slow connections the user has no idea if the form is processing.
- The nav has no CTA. A "Work with me" button in the top-right nav would catch users at any scroll position.

## Whitespace
Generally good. Possibly overdone in a few places:
- The hero is `min-height: 100vh` with `padding: 120px 0 80px`. On a standard 1080p screen the tagline and CTA are nearly below the fold. The name is so large it pushes everything down. On smaller laptops (13") the CTA button is definitely not visible without scrolling.
- Section padding is 120px top and bottom. Generous but appropriate for this aesthetic.

## Mobile
Several real problems:
1. **Nav hides all links at 480px** — `nav-links { display: none; }` — with no hamburger menu replacement. Mobile users have zero navigation. This is a significant UX gap.
2. The `about-big-num` ("09") on mobile switches to a flex row alongside "Years" — fine, but the 72px number still takes up a lot of vertical space for decorative value only.
3. The clients grid on mobile collapses to 2-column at 768px, then 1-column at 480px — that's fine, but each `client-type` cell has `padding: 40px 32px` which is excessive at mobile sizes.

## Load time
Two Google Font families (Cormorant Garamond, Jost) with multiple weights loaded. The `link rel="preconnect"` is there, which is good. But no `font-display: swap` is set, meaning text may be invisible during font load (FOIT). This should be addressed.

## What's broken
1. No mobile nav (P0)
2. Hero CTA likely below fold on 13" laptops (P1)
3. Duplicate CTAs with different labels for same action (P1)
4. Stats section missing container — edge-to-edge breakage on ultrawide (P1)
5. No font-display: swap (P2)
6. Form has no loading state (P2)

## Verdict
**6.5/10.** Beautiful on desktop, genuinely broken on mobile. The no-nav-on-mobile is a launch blocker.
