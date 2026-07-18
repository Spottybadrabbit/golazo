# GOLAZO — design brief

**Product:** GOLAZO. A World Cup 2026 fan game built on the TxLINE data feed.
Three loops: Hi-Lo streak game on live match stats, group sweepstakes with live
standings, and PunditBot, a mascot commentator that reacts to every feed tick.
Consumer and Fan Experiences track (Superteam x TxODDS World Cup hackathon).

**Design read:** For mainstream football fans on their phone at halftime. The
register is matchday adrenaline wrapped in a toy: loud, warm, tactile, never
corporate. A betting terminal wearing a club scarf.

**Concept spine:** "Every tick is a matchday." The TxLINE feed heartbeat (a new
stat snapshot every few seconds) is the game clock, the confetti trigger, and
the reason to come back. The whole site pulses on the tick.

**Delivery tier:** spectacle. GSAP + Lenis scroll choreography, a Three.js
match-ball hero scene that responds to pointer and scroll, layered parallax
plates, custom cursor glow on desktop.

**Palette (locked):**
- `#081231` night cobalt (page ground), `#0E1B45` surface, `#162660` raised
- `#F5F2E8` chalk cream (text, chalk line work)
- `#FF4632` matchday scarlet, the single accent (CTAs, streak flame, live dots)
- `#8FA0C9` muted cobalt for secondary text
Defense: betting apps live in graphite + neon green. GOLAZO refuses the genre
default: night cobalt is floodlit sky, cream is the chalk line, scarlet is the
away shirt. Warm toy-like contrast, zero neon slop. Green/red appear only as
data semantics inside charts, never as brand chrome.

**Type (locked):** Outfit (display + UI, geometric and rounded, the toy voice)
+ IBM Plex Mono (odds, tickers, stat readouts, the terminal voice). No serifs.

**Tier-1 technique:** B1 cutout parallax rig on the hero: generated stadium
plate behind a Three.js match ball, chalk headline and ticker riding separate
scroll rates, cursor micro-tilt. It enacts the spine: the stadium literally
sits behind everything you do. Second beat (spectacle): C3-style scrub where
the live odds pulse section counts and charts scrub with scroll. Mobile: cursor
tilt off, parallax rates halved, ball becomes slow idle spin.

**Sections (landing):** 1 Hero (split: chalk headline + ball scene over stadium
plate, live ticker strip below) · 2 How it plays (asymmetric 2-col with live
demo card) · 3 Live pulse (full-bleed odds board, scrubbed) · 4 Squad
sweepstakes (split with trophy plate) · 5 PunditBot (chat preview riding tifo
plate) · 6 Fair data + fee (quiet band) · 7 Footer CTA. Eyebrow budget: 2.

**Asset plan (Higgsfield nano_banana_pro):** 21:9 stadium hero plate · 1:1
mascot (parrot commentator, cobalt ground) · 3:2 trophy plate · 16:9 tifo
crowd plate. OG image derived from hero + type. Icons: custom inline chalk
set drawn to one 2px round-cap stroke style, cream on cobalt.

**CTA inventory:**
- "Start a streak" (hero, primary): scarlet capsule, ball icon rolls on hover,
  presses down on :active.
- "Join the squad" (squad section): cream outline capsule that fills with
  scarlet sweep on hover.
- "Open PunditBot" (pundit section): chat-bubble shaped button with typing
  dots on hover.
- Bottom app nav (play/squad/pundit) on app routes: chalk tabs, scarlet
  underline puck that slides.

**Mobile:** every multi-col section stacks; game runs thumb-first with bottom
nav; hero ball scales to 60vw and loses cursor tilt; ticker becomes swipeable.

**Data:** deterministic seeded TxLINE simulator (hackathon rules allow sim
feeds), same engine on server and client so every visitor sees the same live
world with zero lag. Architecture keeps a `TXLINE_MODE=live` seam.

**Monetization:** 2% boost fee on boosted streak cash-outs and 2% rake on
squad pools, shown honestly in the UI as "how GOLAZO keeps the lights on."
