/**
 * Screenshot and assert the results screen at every viewport the design claims
 * to support.
 *
 * Drives the system Chrome through `playwright-core` rather than a bundled
 * Chromium, so nothing large is downloaded and the local browser is the one
 * being measured.
 *
 *   node scripts/capture.mjs                 # against an already-running server
 *   node scripts/capture.mjs --url=…         # against another origin
 *   node scripts/capture.mjs --keep-server   # leave vite preview up afterwards
 *
 * Exits non-zero if any console error, horizontal overflow, or page scroll
 * appears, so it can be used as a gate rather than a one-off check.
 */
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'screenshots')

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const URL_BASE = args.url ?? 'http://localhost:4173'
/* `--live` submits a fixed answer set through the backend, so the captures show
   real TMDB posters instead of the local fallback's typographic stand-ins. */
const RESULT_URL = `${URL_BASE}/?screen=results${args.live ? '&live=1' : ''}`

/* The viewport matrix progress.md claims to have verified. */
const VIEWPORTS = [
  ['small', 320, 480],
  ['phone', 360, 640],
  ['phone', 375, 667],
  ['phone', 390, 844],
  ['phone', 430, 932],
  ['tablet', 768, 1024],
  ['landscape', 1024, 768],
  ['desktop', 1440, 900],
  ['wide', 1920, 948],
]

/* Chrome is not on PATH for the packaged bundler in every environment. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.')
  process.exit(2)
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/* Chrome enforces a ~504px minimum window on Windows, so `--window-size` cannot
   express a 320px viewport and every "phone" capture comes back silently
   cropped. Driving the viewport through the browser context is the only way to
   get the number you asked for. */
async function ensureServer() {
  if (await reachable(URL_BASE)) return null
  console.log(`No server at ${URL_BASE}; starting vite preview…`)
  /* Invoked through Node rather than `npx` with `shell: true`, so nothing has
     to be concatenated into a command line (which is both a deprecation warning
     and an injection surface) and no console window flashes on Windows. */
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) {
    throw new Error(`vite is not installed at ${viteBin}. Run npm install first.`)
  }
  const child = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await reachable(URL_BASE)) return child
  }
  child.kill()
  throw new Error('vite preview did not come up')
}

const browser = await chromium.launch({ executablePath: chromePath })
const server = await ensureServer()
const report = []
let failures = 0

mkdirSync(OUT, { recursive: true })

try {
  for (const [label, width, height] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

    await page.goto(RESULT_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const m = await page.evaluate(() => {
      const de = document.documentElement
      /* Split overflow into two buckets. What matters is whether the content
         escapes somewhere a user can actually see it, so an element counts as
         fine if it — or anything above it — clips or scrolls horizontally. The
         carousel track scrolls sideways inside a clipping `.swiper`; the tear
         line's punch notches overflow the stub but are clipped by it; both are
         intentional. Only overflow that reaches an unclipped ancestor is a real
         layout bug, and that case shows up as page overflow anyway. */
      const clipped = new Set()
      const spilling = new Set()
      const isClippedByAncestor = (el) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX
          if (ox !== 'visible') return true
        }
        return false
      }
      document.querySelectorAll('*').forEach((el) => {
        if (el.scrollWidth <= el.clientWidth + 2 || el.clientWidth <= 0) return
        const cls = (el.className || '').toString()
        if (/\bsr-only\b/.test(cls)) return
        const name = `${el.tagName.toLowerCase()}.${cls.split(' ')[0]}`
        if (isClippedByAncestor(el)) clipped.add(name)
        else spilling.add(name)
      })
const stub = document.querySelector('.slip')
      const posters = [...document.querySelectorAll('.strip__thumb')]
      const broken = posters.filter((p) => p.tagName === 'IMG' && p.complete && p.naturalWidth === 0)
      return {
        pageOverflowX: de.scrollWidth > de.clientWidth,
        pageScrollY: de.scrollHeight > de.clientHeight + 2,
        stubW: stub ? Math.round(stub.getBoundingClientRect().width) : null,
        stubH: stub ? Math.round(stub.getBoundingClientRect().height) : null,
        stubScrolls: stub ? stub.scrollHeight > stub.clientHeight + 2 : null,
        dots: document.querySelectorAll('.deck__dot').length,
        liveRegion: (document.querySelector('[role="status"]')?.textContent ?? '').trim(),
        posters: posters.length,
        postersLoaded: posters.filter((p) => p.tagName === 'IMG' && p.naturalWidth > 0).length,
        postersStandin: posters.filter((p) => p.tagName !== 'IMG').length,
        postersBroken: broken.length,
        clipped: [...clipped],
        spilling: [...spilling],
      }
    })

    await page.screenshot({ path: join(OUT, `results-${label}-${width}x${height}.png`) })

    /* Posters arrive from a third-party CDN after first paint, so give them a
       beat to either arrive or fail before they are judged. */
    if (m.posters > 0) {
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForFunction(
        () => [...document.querySelectorAll('.strip__thumb')].every(
          (p) => p.tagName !== 'IMG' || p.complete,
        ),
        { timeout: 8000 },
      ).catch(() => {})
      m.postersLoaded = await page.evaluate(
        () => [...document.querySelectorAll('.strip__thumb')].filter((p) => p.tagName === 'IMG' && p.naturalWidth > 0).length,
      )
      m.postersBroken = await page.evaluate(
        () => [...document.querySelectorAll('.strip__thumb')].filter((p) => p.tagName === 'IMG' && p.complete && p.naturalWidth === 0).length,
      )
    }

    /* Keyboard and live-region checks, but only in the swipeable arm — the grid
       arm has no carousel to drive and correctly reports no dots. */
    const kbd = { skipped: 'grid arm' }
    if (m.dots > 0) {
      Object.assign(kbd, await page.evaluate(() => {
        const swiper = document.querySelector('.swiper')
        const dots = [...document.querySelectorAll('.deck__dot')]
        return {
          swiperFocusable: swiper?.getAttribute('tabindex') === '0',
          dotsAreButtons: dots.length > 0 && dots.every((d) => d.tagName === 'BUTTON'),
          dotLabels: dots.map((d) => d.getAttribute('aria-label')),
          swiperOwnBullets: document.querySelectorAll('.swiper-pagination-bullet').length,
          wrapperLiveRegion: document.querySelector('.swiper-wrapper')?.getAttribute('aria-live'),
          status: document.querySelector('.skiper__frame > [role="status"]')?.textContent.trim(),
        }
      }))

      if (kbd.swiperFocusable) {
        await page.focus('.swiper')
        const walked = []
        /* Starting on stub 1, N-1 presses should land on stub N. A press from
           there is a no-op because the deck clamps at the ends, which is the
           other half of the behaviour worth asserting. */
        for (let i = 0; i < m.dots - 1; i++) {
          await page.keyboard.press('ArrowRight')
          await page.waitForTimeout(450)
          walked.push(
            await page.evaluate(() =>
              document.querySelector('.skiper__frame > [role="status"]')?.textContent.trim(),
            ),
          )
        }
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(450)
        kbd.clampedAtEnd =
          (await page.evaluate(() =>
            document.querySelector('.skiper__frame > [role="status"]')?.textContent.trim(),
          )) === walked.at(-1)
        kbd.arrowSequence = walked
        kbd.finalStatus = walked.at(-1)
      }
    }

    const problems = []
    if (errors.length) problems.push(`${errors.length} console error(s): ${errors[0]}`)
    if (m.pageOverflowX) problems.push('horizontal page overflow')
    if (m.pageScrollY) problems.push('vertical page scroll (results screen is locked to 100dvh)')
    if (m.spilling.length) problems.push(`unclipped overflow: ${m.spilling.join(', ')}`)
    if (kbd.swiperFocusable === false) problems.push('carousel is not keyboard focusable')
    if (kbd.dotsAreButtons === false) problems.push('dots are not <button> elements')
    if (kbd.wrapperLiveRegion && kbd.wrapperLiveRegion !== 'off') {
      problems.push(`swiper wrapper keeps aria-live="${kbd.wrapperLiveRegion}" (announces every stub)`)
    }
    if (kbd.arrowSequence) {
      /* Compare the "Result N of M" prefix; the label after it comes from the
         slide data and is asserted separately by the dot labels. */
      const got = kbd.arrowSequence.map((s) => (s ?? '').split(':')[0])
      const expected = Array.from({ length: m.dots - 1 }, (_, i) => `Result ${i + 2} of ${m.dots}`)
      if (got.join('|') !== expected.join('|')) {
        problems.push(`arrow keys walked ${got.join(' -> ')}, expected ${expected.join(' -> ')}`)
      }
      if (kbd.clampedAtEnd === false) problems.push('arrow key past the last stub did not clamp')
    }
    /* Only meaningful in `--live` mode. Without a reachable backend the local
       fallback is typographic stand-ins by design, so a zero here is expected
       rather than a failure — but a broken image is never acceptable. */
    if (m.postersBroken > 0) problems.push(`${m.postersBroken} poster(s) failed to load`)
    if (args.live && m.posters > 0 && m.postersLoaded === 0) {
      problems.push('--live was requested but no TMDB poster loaded')
    }
    failures += problems.length

    report.push({ viewport: `${label} ${width}x${height}`, ...m, kbd, errors, problems })
    console.log(
      `${problems.length ? 'FAIL' : 'ok  '}  ${label.padEnd(9)} ${String(width).padStart(4)}x${String(height).padEnd(4)}` +
        `  stub ${m.stubW}x${m.stubH}${m.stubScrolls ? ' (scrolls)' : ''}` +
        `  dots ${m.dots}` +
        `  posters ${m.postersLoaded}/${m.posters}` +
        (m.postersStandin ? ` +${m.postersStandin} stand-in` : '') +
        (kbd.arrowSequence ? `  kb ${kbd.arrowSequence.length - 1} steps` : '') +
        (problems.length ? `\n        ${problems.join('\n        ')}` : ''),
    )
    await context.close()
  }
} finally {
  await browser.close()
  if (server && !args['keep-server']) server.kill()
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.length} viewports · ${failures} problem(s) · screenshots in ${OUT}`)
process.exit(failures ? 1 : 0)