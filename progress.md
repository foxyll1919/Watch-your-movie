# CineColor build progress

## Decision sheet

- **SUBJECT** — Watch Your Movie is a mobile-first movie personality quiz for people who want a quick, opinionated recommendation rather than a streaming catalog.
- **GROUND** — cinema tickets, screening schedules, poster proofs, genre tags, critic's notes, and the physical pause before a film starts.
- **PALETTE** — paper `#F5F0E3`, cream `#EFE8D5`, card `#FAF7ED`, ink `#171612`, muted `#77736A`, rule `#D8D1C1`, warm gray `#9A9589`; one accent per screen from red `#EF3B2D`, orange `#E87845`, mustard `#D6B83E`, green `#7C9A70`, blue `#6D8FA3`, plum `#795477`. Those six accents stay muted because they belong to the paper page. The result stubs use a second, saturated set — red `#FF2D14`, orange `#FF6B2C`, mustard `#FFC300`, green `#2F9E44`, blue `#0F6FC4`, plum `#A6459F` — lifted until each clears 4.5:1 against its own ink at label size (4.86, 6.37, 11.26, 5.25, 4.79, 4.93). The four stubs are also given distinct grounds: the profile colour, ink `#171612` for the character match, cream `#FAF7ED` for the stretch.
- **TYPE** — display: `Playfair Display` for poster headlines and result types; text: `DM Sans` for reading and controls; brand: `Bungee` for the logotype and the emphasised phrase in the hero headline; utility: letter-spaced small caps for question counts, labels, and progress. Stub type is sized in `cqi` against the stub's own inline size, not the viewport, so a column that lands at 200px gets type that fits it.
- **SPACE** — `--gutter` scales from 20px to 64px; section rhythm 32/64/96px; the quiz frame is capped at 780px and the page at 1140–1200px. The quiz frame is tuned to close inside a 667px viewport with no scrolling. The results screen goes further and claims `100dvh` outright: header, deck, footer, and no page scroll between them.
- **SHAPE** — 12px controls, 20–32px cards, pill buttons, hairline rules, and one soft shadow reserved for the result stubs. A stub adds the two ticket moves: a full-bleed dashed tear line with semicircular punch notches painted in the page colour, and a rounded corner at roughly two-thirds of the card radius.
- **MOTION** — three moments: hover/focus response on answers and cards, the progress fill, and the share confirmation; 160–320ms, all transform/opacity. The deck adds a horizontal snap between stubs, and a half-degree alternating tilt from 640px up that `prefers-reduced-motion` removes outright rather than animating to rest.
- **SIGNATURE** — `logo.png`, a cut-and-paste collage on a transparent field, is the primary mark: it carries the home hero at `clamp(112px, 25vw, 208px)`. It only resolves as artwork from 48px up, so compact chrome uses the `Bungee` logotype instead of a shrunken raster. The result is a torn strip of four numbered stubs built to be screenshotted complete: blue profile stub, black character-match stub, contrast-colour stub, cream stretch stub, tilted a degree apart.

## Implementation decisions

- Built as a Vite React app with an optional FastAPI integration; quiz data is imported from `config.json` in the browser and loaded from the same file by the API.
- The complete user flow is home, intro, quiz, results, loading, error, and restart states. If `VITE_API_URL` is unset or unavailable, the browser uses the local deterministic result.
- Answers are real radio inputs inside a `fieldset`, so arrow-key navigation and screen readers work without custom key handling; selecting an option advances the quiz. The frame is keyed on `questionIndex`, so every question mounts a fresh option set and the previous answer can never stay ticked.
- Keyboard focus follows the keyboard: a module-scoped `keyboardMode` flag (set by `onKeyDownCapture`/`onPointerDownCapture` on the shell, so it outlives the remount) hands focus to the first option of the next question and keeps the ring painted, while pointer users are never focus-shifted.
- The home hero carries the raster logo and no logotype; every other screen carries the logotype and no raster, so the brand is never stated twice in one viewport.
- Sharing uses `navigator.share` with a clipboard fallback; both share controls report a rejected clipboard write rather than failing silently, since the usual cause is an insecure context where the button would otherwise appear inert.
- Movie cards use typographic poster art until a configured TMDB key supplies real poster images through the backend.
- One function, `resolveResult`, decides what the result is. The shell's accent variables and the deck both read from it, so the colour of a stub can never disagree with the words printed on it.
- `sanitizeResultData` treats the API response as untrusted: every field is shape-checked and an unknown colour key is rejected outright, because indexing `colorDetails` with a key the build has never heard of takes the whole screen down. A rejected response falls back to the local deterministic result.
- A run token, bumped whenever the flow is abandoned, guards the final answer's 650ms wait and network round trip. The header's "Start over" is reachable the whole time, and without the token cancelling mid-wait still lands the user on the results screen.
- The results deck reads its active index back from the track's own scroll position, so a swipe, a dot, an arrow key and a native scrollbar all agree. Arrow keys are handled on the deck rather than the track, so they work wherever focus landed inside it.
- The narrow arm of the results deck is the adapted Skiper 48 carousel (`components/ui/skiper-ui/skiper48.jsx`); the grid arm from 640px up is unchanged. Swiper replaces scroll-snap only below 640px, where the stubs are large enough that the swipe reads. All three of Swiper's defaults were replaced rather than accepted, each for a measured reason: its bullets are `<span role="button">` (real `<button>`s are rendered instead), its a11y module puts `aria-live="polite"` on `.swiper-wrapper` (silenced, since it announces all four stubs — about 700 characters — on every change), and it never makes its container focusable (`tabIndex={0}` plus a listener attached to `swiper.el`, because an `onKeyDown` prop is swallowed).
- CSS is mobile-first against a 360px phone. Every breakpoint adds; none narrows. Short viewports get their own `max-height` axis because a squat screen is a height problem, not a width one.

## Status

- [x] Decision sheet written before markup
- [x] Home and intro screen
- [x] 30-question quiz interaction with 1–5 scoring
- [x] Deterministic top-two color result calculation
- [x] Results view with dominant/contrast profiles and recommendation cards
- [x] Loading, error, focus, active, and reduced-motion states
- [x] shadcn/ui Button, Select, Progress, Skeleton, and Spinner composition
- [x] FastAPI scoring endpoint with optional TMDB discovery integration
- [x] Frontend API integration with local fallback
- [x] Responsive visual pass at 375, 390, 430, 768, 1024, and 1440px (zero horizontal overflow, zero console errors)
- [x] Browser interaction verification across the full flow, including a keyboard-only pass
- [x] Quiz question verified to close inside the viewport at 375×667, 390×844, 430×932, and 1920×948 (zero vertical scroll)
- [x] Web Interface Guidelines review and static design audit (zero findings)
- [x] Results rewritten as a four-stub deck: mobile-first, saturated ticket colours, and the page locked to the viewport
- [x] Zero page scroll verified at 320×480, 360×640, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1440×900, and 1920×948
- [x] Stubs fit without internal scroll from 360×640 up; only 320×480 scrolls inside a stub, and its content stays reachable
- [x] Deck verified by dot, by arrow key, by stepper, by swipe scroll position, and under `prefers-reduced-motion`
- [x] Narrow deck arm swapped to the adapted Skiper 48 carousel; grid arm from 640px unchanged
- [x] `npm run capture` green across nine viewports — zero console errors, zero page overflow, zero page scroll, keyboard walks every stub and clamps at the end
- [x] Swiper's three default behaviours corrected rather than accepted: `<button>` dots, silenced wrapper live region, focusable container with a working key handler
- [x] TMDB posters rendering in the pick area — verified end to end at every viewport with `npm run capture -- --live`
- [x] CORS covers the `vite preview` origin, so a preview build keeps its posters instead of silently falling back
- [x] `npm run verify` runs lint, build and capture in that order

## Constraints discovered

- `config.json` now parses as 30 weighted questions; its prior question 14 syntax error was fixed.
- `frontend/` has package, lint, typecheck, and build scripts. `backend/` uses `requirements.txt` and can be started with `uvicorn main:app --reload`.
- Backend integration is verified locally with FastAPI TestClient; no TMDB network call is made without `TMDB_API_KEY`.
- `config.json` `stretchText` names a fixed partner colour, so it is only used when the API returns it; the local fallback states the actual top-two pair instead.
- The `@theme inline` bridge in `styles.css` was missing `--color-popover`/`--color-popover-foreground`, so Tailwind never emitted `bg-popover` and every Select popup rendered fully transparent. Both tokens are now bridged, and `SelectItem` also carries an opaque `bg-card` so no option can show the page through it.
- `logo.png` is a transparent PNG whose *alpha channel only encodes the outer crop* — the cream collage rectangles are opaque. It therefore cannot be recoloured with `mask-image` (a mask renders it as a solid blob) and is used as a plain `<img>`, which is why the result card mark keeps its own cream instead of taking `--result-ink`.
- `Wordmark.jsx` and its `.wordmark*` rules were removed; `BrandLogo.jsx` and the `.brand-logo*`/`.brand-lockup*`/`hero-mark*` rules replaced them.
- `ResultCard.jsx` and `MovieCard.jsx` were removed. `ResultSlip.jsx` (stub shell plus poster strip) and `ResultsDeck.jsx` (the deck) replaced both, along with roughly 400 lines of `.result-card*`, `.picks`, `.movie-grid`, `.poster-art*`, `.note*` and `.stretch` rules that had no markup left to style.
- `tsconfig.json` sets `checkJs: false`, so `npm run typecheck` checks almost nothing in this JavaScript codebase and a green run is not evidence of type safety. `npm run lint` is the meaningful gate.
- `config.json` now carries nine characters per profile. Non-binary was a dead end: both `App.jsx` and `backend/main.py` short-circuited it to "no match", so a third of respondents were silently denied the character-match stub. Nine canonically non-binary characters were added across the six profiles and both branches now read the matrix like every other case. **These assignments are placeholder copy and want an editorial pass.**
- Contrast films are capped at three on the stub, not the four the backend fetches. A fourth column leaves each title about 60px on a 360px phone, which clips every name past its second word.
- The deck is one stub per view below 640px, 2×2 from 640px, and 4-up from 1024px. Four-up only works because stub type is sized in `cqi`; before that, a word like "Subconscious" outran its 200px column and was clipped by `overflow-x: hidden`. Two-up was tried at 1024px and rejected: on a 900px-tall desktop each stub came out too short to hold a blurb and a shelf together.
- `body` uses `overflow-x: clip`, not `hidden`. Pairing a non-visible `overflow-x` with a visible `overflow-y` computes that `overflow-y` to `auto`, which quietly makes the body the page scroller and cuts `position: fixed` off the viewport — fatal for a `100dvh` results shell.
- Only `.app-shell--results` is locked to the viewport. Home, intro and quiz keep scrolling with their content, because clipping them would hide copy on a short screen or at large text sizes.
- Punch notches are painted in the page colour and clipped to a semicircle by the stub's own `overflow-x: hidden`. Anything else needs a mask, and the stub is already a rotated, scrolled box.
- `--family-body` was referenced by `.note__source` but defined nowhere, so the declaration was dead and the element silently inherited. Both the rule and the token are gone.
- `padding-inline` takes start then end, so `env(safe-area-inset-right)` was being applied to the left edge. Fixed, and `index.html` now sets `viewport-fit=cover` — without it those insets are always zero in iOS Safari and the whole mechanism is inert.
- Swiper and `container-type: inline-size` feed each other into a runaway width loop. Swiper writes `width: <px>` onto every slide; the stub sizes its type in `cqi`; a wide measurement inflates the type, the type inflates the minimum content width, and the next measurement is wider again. The deck settled at **33,554,392px** and took the whole results screen with it. Three fixes are needed together, and none of them is sufficient alone: `inline-size: 100%` on `.swiper` and `.swiper-wrapper`, `max-inline-size: 100%` on `.swiper-slide`, and `grid-template-columns: minmax(0, 1fr)` on the frame. Capping the slide alone does nothing, because `max-inline-size: 100%` on the slide resolves against a wrapper that has already blown out.
- `onKeyDown` passed to `<Swiper>` is swallowed by `swiper/react`. The listener has to be attached to `swiper.el` directly. Because that listener is attached once, the handler must also read the active index from a ref — a function captured by `addEventListener` keeps the closure it was created with, so reassigning a ref holding the handler does not help, and every arrow press after the first repeats the move.
- Chrome enforces a ~504px minimum window on Windows, so `chrome --headless --window-size=390,844` silently renders at 504px and crops the image to 390. Every "phone" capture taken that way looks like it has a horizontal overflow bug and is not one. Viewport must be set through the browser context; `scripts/capture.mjs` does that, driving the system Chrome via `playwright-core` so nothing large is downloaded.
- `npm run capture` is the gate for the results screen: nine viewports, asserting no console errors, no page overflow, no page scroll, real `<button>` dots, a focusable carousel, a silenced wrapper live region, and that arrow keys walk every stub and clamp at the end. It starts `vite preview` itself if nothing is listening.
- `npm run capture -- --live` additionally submits a fixed answer set through the backend, so captures show real TMDB posters rather than the local fallback's typographic stand-ins. It waits for the third-party CDN to settle before judging a poster, and fails on any image that loads to zero width.
- **Correction to an earlier note in this file's history: `no-undef` was never missing.** It is part of `js.configs.recommended` and is active at `error`, and it does catch an undefined JSX component — a file using `<TotallyUndefinedComponent />` without an import is reported. The `SwiperSlide` crash was missed because `npm run lint` was never run between writing the broken file and opening a browser; the build passed, the screenshots were blank, and that is what surfaced it. The failure was in the order of operations, not the configuration. `npm run verify` (lint → build → capture) exists so lint runs first every time.
- `CORS_ORIGINS` in `backend/.env` allowed only `http://localhost:5173`, the dev server. `vite preview` serves on 4173, so every preview build silently lost its posters: the browser blocked the request, the app fell back to the local result, and the stub drew stand-ins with no message on the page. Both origins are now listed in the file and in `DEFAULT_ORIGINS` in `main.py`.
- `?screen=results` alone renders the local fallback, which has no artwork, so it never exercises the poster path. `&live=1` submits a deterministic answer set through the same endpoint and the same sanitizer the real quiz uses.

