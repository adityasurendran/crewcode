# CrewCode Web Design Contract

Design language: Good Boy Supply stencil adapted for a build-together app —
sunny yellow and cobalt on warm cream, chunky rounded type, sticker badges,
ink outlines with hard offset shadows, playful but plain-spoken. NOT a pet
store; only the visual language carries over. Functional colors (success,
warning, error, info) stay for status.

## The one rule
One bright color does the celebrating (yellow). One strong color does the
doing (cobalt). Everything else is cream, white, and ink.

## Tokens (`app/globals.css`)
- `--accent: hsl(46, 100%, 58%)` (sunny yellow). Primary buttons (ink text),
  hero band, avatar default, chart bars, selected rings.
- `--accent-ink: hsl(228, 40%, 14%)`. Text on yellow. Never white on yellow.
- `--accent-2: hsl(226, 80%, 52%)` (cobalt). Links that act, ticker bar,
  step indicators, secondary emphasis.
- `--pink: hsl(346, 88%, 72%)`. Sticker accents ONLY (badges, never buttons).
- `--bg: hsl(48, 100%, 96%)` warm cream page. `--surface: #ffffff` cards.
- `--border` / `--border-strong: hsl(228, 40%, 14%)` ink. `--border` doubles
  as hairline color only where a 1px divider is explicitly wanted; component
  outlines are 2px ink.
- `--text: hsl(228, 40%, 14%)` ink, never pure black. `--text-2` body,
  `--text-3` muted (readable, never whisper gray).
- Radius: buttons/inputs 8px, cards 14px, hero/panels 20-32px, stickers and
  pills 9999px. Nothing sharp except the page grid.
- Shadows are HARD OFFSETS ONLY: 4px buttons/cards, 2px small elements,
  8px modal. No soft shadows, no blur, no glow anywhere.
- Type: Bricolage Grotesque 800 for headlines/wordmark, Nunito 400 body at
  16px/1.55, Nunito 800 for buttons/labels. Monospace only for codes and PINs.

## Taste rules (no AI slop)
- No gradients except the gray loading shimmer. No glassmorphism, no blur
  (modal backdrop is flat black at 50%).
- No emojis in UI. No em dashes in copy; periods and commas.
- Icons only where the language puts them: brand bone, three how-it-works
  glyphs. Everywhere else, words and colored dots. No icon library sprawl.
- No scroll-triggered reveals. Motion is mount-only and functional.
- Copy is concrete and plain. Say what happens and what to do next.
- Spacing scale: 4 / 8 / 12 / 16 / 24. Content padding 24, cards 16.

## Signature moments
- **Ticker**: cobalt bar, cream marquee, live project numbers. Home only.
- **Hero**: yellow band, 32px rounding, 2px ink border, hard shadow, big
  Bricolage headline, ask box, magnetic primary button.
- **Stickers**: rotated pills (pink/blue/white/yellow), 2px ink border,
  wobble on hover. PIN panel, LIVE flag. Never on buttons.
- **Wave edge**: one SVG wave above the ink footer. restraint: one use.
- **Footer**: ink band, giant yellow Bricolage wordmark, small links.
- **Buttons**: yellow bg, ink text, 2px ink border, 4px hard shadow; hover
  lifts 2px and grows the shadow to 6px; press sinks 4px and drops it. 120ms.
- **Stepper** (onboarding): cobalt indicators, yellow continue button.

## Motion (GSAP-free: Lenis + motion + react-bits)
- `lenis`: smooth scrolling, provider-level, always on.
- Mount entrance: single subtle stagger on Home stat grid (opacity/y, once).
- `Counter`, `Magnet`, `Stepper`: vendored from DavidHDev/react-bits under
  `app/components/bits/` with attribution; recolored to this system.
- Skipped deliberately: `AnimatedList`/`FadeContent` (scroll-fade),
  `ShinyText`/`SplitText` heroes, cursor followers, glass/tilt cards.
