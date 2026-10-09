import React from "react"
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, ArrowLeft, ArrowUpRight, RotateCcw } from 'lucide-react'

import { BrandLogo } from '@/components/BrandLogo'
import { ResultSlip, PickStrip, formatGenres, renderArchetype } from '@/components/ResultSlip'
import { ResultsDeck } from '@/components/ResultsDeck'
import { ShareButton, CopyLinkButton } from '@/components/ShareButton'

import quizConfig from '../../config.json'
const quizQuestions = quizConfig.quizQuestions
const activeQuestionIds = new Set(quizConfig.activeQuestionIds ?? quizQuestions.map((question) => question.id))
const quizPool = quizQuestions.filter((question) => activeQuestionIds.has(question.id))

const INK = '#171612'
const CREAM = '#FAF7ED'

/**
 * The six movie personalities. Keys stay aligned with `config.json` weights.
 *
 * `vivid` is the saturated ticket colour, used only on a slip, lifted from the
 * muted paper accent in `styles.css` until it holds 4.5:1 against `vividInk` at
 * label size: red 4.86, orange 6.37, mustard 11.26, green 5.25, blue 4.79,
 * plum 4.93. The muted accents stay in the stylesheet, where the page uses them.
 */
const colorDetails = {
  red: {
    name: 'Red',
    vivid: '#FF2D14',
    vividInk: INK,
    descriptor: 'The Kinetic Storyteller',
    blurb: 'You watch for the moment a film stops being polite. Tension, nerve, and characters who spend everything they have.',
  },
  blue: {
    name: 'Blue',
    vivid: '#0F6FC4',
    vividInk: CREAM,
    descriptor: 'The Existential Philosopher',
    blurb: 'You are happy to sit inside a question for two hours. Restraint, silence, and endings that stay open after the lights come up.',
  },
  green: {
    name: 'Green',
    vivid: '#2F9E44',
    vividInk: INK,
    descriptor: 'The Grounded Observer',
    blurb: 'You watch for the quiet truth underneath. Ordinary lives, honest work, and small details doing all the heavy lifting.',
  },
  yellow: {
    name: 'Mustard',
    vivid: '#FFC300',
    vividInk: INK,
    descriptor: 'The Visual Optimist',
    blurb: 'You watch for the lift. Warmth, wit, and stories that leave the room brighter than they found it.',
  },
  orange: {
    name: 'Orange',
    vivid: '#FF6B2C',
    vividInk: INK,
    descriptor: 'The Warmth-Seeker',
    blurb: 'You watch to feel held. Generous ensembles, big-hearted humour, and always somebody worth rooting for.',
  },
  purple: {
    name: 'Plum',
    vivid: '#A6459F',
    vividInk: CREAM,
    descriptor: 'The Subconscious Architect',
    blurb: 'You watch for what the film only hints at. Symbol, dream logic, and beautiful things slightly out of focus.',
  },
}

const COLOR_KEYS = Object.keys(colorDetails)

/**
 * `config.json` stores each match as "Character — Film". The result card shows
 * it as a sentence ("Tyler Durden from Fight Club"), so the pair is split once
 * here instead of being re-derived on every render.
 */
function splitCharacterMatch(value) {
  if (!value) return { name: '', film: '' }
  const [name, ...rest] = String(value).split(/\s+[—–-]\s+/)
  return { name, film: rest.join(' ') }
}

/**
 * One film, one shape, whatever produced it. The API sends TMDB records with
 * a poster path; the local shelves send [title, year] tuples and carry no
 * artwork, so both converge here and the cards decide what to draw.
 */
function toPick(movie) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date?.slice(0, 4) || '—',
    poster: movie.poster_path,
  }
}

function toFallbackPick([title, year]) {
  return { id: title, title, year, poster: null }
}

/** Fallback shelves, name and year only — the card carries no film blurbs. */
const recommendations = {
  red: [['The Green Knight', '2021'], ['Dune', '2021'], ['Oppenheimer', '2023']],
  blue: [['Call Me by Your Name', '2017'], ['Eternal Sunshine of the Spotless Mind', '2004'], ['The Shape of Water', '2017']],
  green: [['Boyhood', '2014'], ['Moneyball', '2011'], ['Nomadland', '2020']],
  yellow: [['Scott Pilgrim vs. the World', '2010'], ['Dead Poets Society', '1989'], ['Chef', '2014']],
  orange: [['Coach Carter', '2005'], ['The Worst Week of My Life', '2016'], ['Bohemian Rhapsody', '2018']],
  purple: [['La La Land', '2016'], ['Blue Valentine', '2010'], ['Eyes Wide Shut', '1999']],
}

const answerLabels = ['Not for me', 'Probably not', 'Maybe', 'Probably', 'Definitely']

/**
 * Module-scoped on purpose: the quiz frame remounts for every question, so the
 * last input modality has to outlive the component that observed it. It drives
 * where focus lands after an answer and whether the ring is painted.
 */
let keyboardMode = false

/**
 * `VITE_API_URL` can point at a separately hosted API. Vercel serves the
 * frontend and API on one origin, so production defaults to the same-origin
 * `/api` rewrite. Local Vite development probes the local FastAPI server once.
 * If that local server is unavailable, the app falls back to its local data.
 */
const LOCAL_API = 'http://localhost:8000'
const PROBE_TIMEOUT_MS = 2500
let reachableApi = undefined

function normalizeApiUrl(value) {
  return String(value).trim().replace(/\/+$/, '')
}

/**
 * The probe needs a deadline. Without one, anything that holds the port without
 * answering leaves the quiz on its loading frame for good, with no error and no
 * way forward.
 */
function timeoutSignal() {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(PROBE_TIMEOUT_MS)
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  return controller.signal
}

async function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL
  if (configured) return normalizeApiUrl(configured)
  if (!import.meta.env.DEV) return window.location.origin
  if (reachableApi === undefined) {
    reachableApi = fetch(`${LOCAL_API}/api/health`, { signal: timeoutSignal() })
      .then((response) => (response.ok ? LOCAL_API : null))
      .catch(() => null)
  }
  return reachableApi
}

/**
 * The API response is treated as untrusted input: every field is checked for the
 * shape the deck expects and an unknown colour key is rejected outright, because
 * indexing `colorDetails` with a key the build has never heard of would take the
 * whole results screen down. Returning `null` falls the run back to the local
 * deterministic result, which always renders.
 */
function sanitizeResultData(payload) {
  if (!payload || typeof payload !== 'object') return null
  const main = COLOR_KEYS.includes(payload.main_color) ? payload.main_color : null
  if (!main) return null

  const text = (value) => (typeof value === 'string' && value.trim() ? value : undefined)
  const ids = (value) => (Array.isArray(value) ? value.filter((id) => Number.isFinite(id)) : [])
  const films = (list, limit) =>
    Array.isArray(list)
      ? list
          .filter((movie) => movie && typeof movie.title === 'string' && movie.title.trim())
          .slice(0, limit)
          .map(toPick)
      : []

  return {
    main,
    contrast: COLOR_KEYS.includes(payload.contrast_color) ? payload.contrast_color : null,
    archetype: text(payload.archetype),
    characterMatch: text(payload.character_match),
    stretchText: text(payload.stretch_text),
    mainGenres: ids(payload.main_genres),
    contrastGenres: ids(payload.contrast_genres),
    mainMovies: films(payload.main_movies, 3),
    contrastMovies: films(payload.contrast_movies, 3),
  }
}

const ageKeys = { under25: 'under_25', '25to40': '25_40', over40: 'over_40' }

const sexKeys = { male: 'male', female: 'female', nonbinary: 'nonbinary' }

function shuffledQuestions() {
  const order = [...quizPool]
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}

function getResult(answers, questions) {
  const totals = Object.fromEntries(Object.keys(colorDetails).map((color) => [color, 0]))
  answers.forEach((answer, questionIndex) => {
    const question = questions[questionIndex]
    if (!question) return
    Object.entries(question.weights).forEach(([color, weight]) => {
      totals[color] += answer * weight
    })
  })
  const ranking = Object.entries(totals).sort(([, a], [, b]) => b - a)
  return { main: ranking[0][0], contrast: ranking[1][0], totals }
}

/** Falls back to the same `config.json` matrix the API scores from. */
function localCharacterMatch(color, age, sex) {
  const sexKey = sexKeys[sex]
  if (!sexKey) return ''
  return quizConfig.colorProfiles?.[color]?.characters?.[`${sexKey}_${ageKeys[age]}`] || ''
}

/**
 * One place decides what the result actually is. The shell's accent variables
 * and the deck both read from this, so the colour of a slip can never disagree
 * with the words printed on it. `resultData` has already been through
 * `sanitizeResultData`, so every key here is known to the build.
 */
function resolveResult({ answers, questions, age, sex, resultData }) {
  const local = getResult(answers, questions)
  const mainKey = resultData?.main || local.main
  const contrastKey = resultData?.contrast || local.contrast
  const main = colorDetails[mainKey]
  const contrast = colorDetails[contrastKey]

  const character = splitCharacterMatch(
    resultData?.characterMatch || localCharacterMatch(mainKey, age, sex),
  )

  const mainMovies = resultData?.mainMovies?.length
    ? resultData.mainMovies
    : (recommendations[mainKey] || []).map(toFallbackPick)
  const contrastMovies = resultData?.contrastMovies?.length
    ? resultData.contrastMovies
    : (recommendations[contrastKey] || []).map(toFallbackPick)

  return {
    mainKey,
    contrastKey,
    main,
    contrast,
    archetype:
      resultData?.archetype || quizConfig.colorProfiles?.[mainKey]?.archetype || main.descriptor,
    character,
    stretchText:
      resultData?.stretchText ||
      `You scored ${main.name.toLowerCase()} cinema first and ${contrast.name.toLowerCase()} a close second — which makes it the most interesting thing to watch next.`,
    mainMovies: mainMovies.slice(0, 3),
    /* Three, not four. A fourth column leaves each title about 60px on a 360px
       phone, which clips every name past its second word; three keeps the two
       shelves on the same rhythm and the same legibility. */
    contrastMovies: contrastMovies.slice(0, 3),
    mainGenreLine: formatGenres(resultData?.mainGenres),
    contrastGenreLine: formatGenres(resultData?.contrastGenres),
  }
}

/* QA entry point: `?screen=results` opens straight onto the result screen with
   the local deterministic result. The capture harness in `scripts/capture.mjs`
   depends on it to shoot every viewport without replaying thirty questions. */
/* A deterministic answer set for the QA entry point below. It walks the active
   questions and spreads the scale so the result is stable run to run, which is
   what makes a screenshot comparable between captures. */
const QA_ANSWERS = quizPool.map((_, index) => (index % 5) + 1)
const QA_AGE = '25to40'
const QA_SEX = 'nonbinary'

function App() {
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
  const [screen, setScreen] = React.useState(params?.get('screen') === 'results' ? 'results' : 'home')
  const [age, setAge] = React.useState('')
  const [sex, setSex] = React.useState('')
  const [answers, setAnswers] = React.useState([])
  const [sessionQuestions, setSessionQuestions] = React.useState(quizPool)
  const [questionIndex, setQuestionIndex] = React.useState(0)
  const [isCalculating, setIsCalculating] = React.useState(false)
  const [resultData, setResultData] = React.useState(null)
  const [error, setError] = React.useState('')

  // A run token, bumped whenever the flow is abandoned. Finishing the quiz waits
  // out a delay and a network round trip, and the header's "Start over" is
  // reachable the whole time; without this, cancelling mid-wait still lands the
  // user on a result for the run they just left. `submitting` covers the same
  // window against a double-tap on the final question.
  const runToken = React.useRef(0)
  const submitting = React.useRef(false)

  /* `?screen=results` on its own renders the local fallback, which has no
     artwork and therefore never exercises the poster path. `&live=1` submits a
     fixed answer set through the same endpoint and the same sanitizer the real
     flow uses, so a capture shows the screen as a user with a reachable backend
     sees it. No backend, no key, or a rejected response all leave the local
     result standing, exactly as they do in the quiz. */
  const wantsLiveResult = params?.get('live') === '1'
  React.useEffect(() => {
    if (!wantsLiveResult || screen !== 'results' || resultData) return undefined
    let cancelled = false

    const run = async () => {
      const apiUrl = await resolveApiUrl()
      if (!apiUrl || cancelled) return
      try {
        const response = await fetch(`${apiUrl}/api/quiz/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: QA_ANSWERS, age: QA_AGE, sex: QA_SEX }),
        })
        if (!response.ok) throw new Error('Quiz service returned an error')
        const parsed = sanitizeResultData(await response.json())
        if (parsed && !cancelled) setResultData(parsed)
      } catch {
        /* The local deterministic result is already on screen; nothing to say. */
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [wantsLiveResult, screen, resultData])

  const abandonRun = () => {
    runToken.current += 1
    submitting.current = false
  }

  const begin = () => {
    setError('')
    setScreen('intro')
  }

  const startQuiz = () => {
    abandonRun()
    setError('')
    setSessionQuestions(shuffledQuestions())
    setQuestionIndex(0)
    setAnswers([])
    setIsCalculating(false)
    setScreen('quiz')
  }

  const answerQuestion = async (answer) => {
    if (submitting.current) return
    const nextAnswers = [...answers, answer]
    setAnswers(nextAnswers)

    if (nextAnswers.length < sessionQuestions.length) {
      setQuestionIndex((current) => current + 1)
      return
    }

    submitting.current = true
    setIsCalculating(true)
    const token = runToken.current

    await new Promise((resolve) => window.setTimeout(resolve, 650))
    if (token !== runToken.current) return

    const apiUrl = await resolveApiUrl()
    if (token !== runToken.current) return

    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}/api/quiz/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: nextAnswers, age, sex }) })
        if (!response.ok) throw new Error('Quiz service returned an error')
        const parsed = sanitizeResultData(await response.json())
        if (!parsed) throw new Error('Unexpected response shape')
        setResultData(parsed)
      } catch {
        setResultData(null)
        setError('The cinema service is unavailable, so we are using the local screening result.')
      }
    }

    if (token !== runToken.current) return
    submitting.current = false
    setIsCalculating(false)
    setScreen('results')
  }

  const restart = () => {
    abandonRun()
    setIsCalculating(false)
    setScreen('home')
    setAnswers([])
    setResultData(null)
    setError('')
    setSessionQuestions(quizPool)
    setQuestionIndex(0)
  }

  const result = React.useMemo(
    () => resolveResult({ answers, questions: sessionQuestions, age, sex, resultData }),
    [answers, sessionQuestions, age, sex, resultData],
  )

  const shellStyle =
    screen === 'results'
      ? {
          '--result-color': result.main.vivid,
          '--result-ink': result.main.vividInk,
          '--result-contrast': result.contrast.vivid,
          '--result-contrast-ink': result.contrast.vividInk,
        }
      : undefined

  return (
    <>
      <div
        className={`app-shell app-shell--${screen}`}
        style={shellStyle}
        onKeyDownCapture={() => { keyboardMode = true }}
        onPointerDownCapture={() => { keyboardMode = false }}
      >
        <a className="skip-link" href="#main-content">Skip to content</a>
        {screen !== 'home' && (
          <header className="site-header">
            <button className="brand-lockup" type="button" onClick={restart}>
              <span className="brand-lockup__logotype" translate="no">Watch Your Movie</span>
              <span className="sr-only">— back to the start</span>
            </button>
            <div className="site-header__aside">
              {screen !== 'results' && (
                <Button className="text-action" variant="ghost" onClick={restart}>
                  <RotateCcw aria-hidden="true" />
                  Start over
                </Button>
              )}
            </div>
          </header>
        )}

        <main id="main-content">
          {screen === 'home' && <Home onBegin={begin} />}
          {screen === 'intro' && <Intro age={age} sex={sex} setAge={setAge} setSex={setSex} onBack={() => setScreen('home')} onStart={startQuiz} error={error} setError={setError} />}
          {screen === 'quiz' && (
            <Quiz
              key={sessionQuestions[questionIndex]?.id ?? questionIndex}
              question={sessionQuestions[questionIndex]}
              index={questionIndex}
              total={sessionQuestions.length}
              onAnswer={answerQuestion}
              isCalculating={isCalculating}
              moveFocus={keyboardMode && questionIndex > 0}
            />
          )}
          {screen === 'results' && <Results result={result} error={error} onRestart={restart} />}
        </main>
      </div>
    </>
  )
}

function Home({ onBegin }) {
  return (
    <section className="screen screen--center" aria-labelledby="home-title">
      <div className="stack">
        <div className="hero-mark">
          <BrandLogo size="hero" />
          <hr className="dashes hero-mark__rule" />
        </div>
        <h1 className="display" id="home-title">
          What kind of <em>movie watcher</em> are you?
        </h1>
        <p className="lede">
          Discover your movie-watching personality, explore your unique taste, and find a few
          films you might love next.
        </p>
        <div className="cta-row">
          <Button className="btn btn--solid" onClick={onBegin}>
            Begin
          </Button>
          <ShareButton label="Share this quiz with a friend" />
        </div>
      </div>
    </section>
  )
}

function Intro({ age, sex, setAge, setSex, onBack, onStart, error, setError }) {
  const ageField = React.useRef(null)
  const sexField = React.useRef(null)

  const submit = (event) => {
    event.preventDefault()
    if (!age) {
      setError('Choose an age group to continue.')
      ageField.current?.focus()
      return
    }
    if (!sex) {
      setError('Choose how you identify to continue.')
      sexField.current?.focus()
      return
    }
    onStart()
  }

  return (
    <section className="screen screen--center" aria-labelledby="intro-title">
      <div className="stack">
        <p className="label">Before the first scene</p>
        <h1 className="title" id="intro-title">
          Tell us how you arrive at the cinema.
        </h1>
        <p className="lede">
          Two details, about three minutes, and no wrong answers. We use them to find the
          character who watches films the way you do.
        </p>
      </div>

      <form className="intro-card" onSubmit={submit}>
        <div className="field">
          <span className="label field__label" id="age-group-label">Age group</span>
          <Select value={age} onValueChange={(value) => { setAge(value); setError('') }}>
            <SelectTrigger ref={ageField} className="details-select-trigger" aria-labelledby="age-group-label">
              <SelectValue placeholder="Choose an age group" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="under25">Under 25</SelectItem>
                <SelectItem value="25to40">25&ndash;40</SelectItem>
                <SelectItem value="over40">Over 40</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="field">
          <span className="label field__label" id="identify-label">How do you identify?</span>
          <Select value={sex} onValueChange={(value) => { setSex(value); setError('') }}>
            <SelectTrigger ref={sexField} className="details-select-trigger" aria-labelledby="identify-label">
              <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="nonbinary">Non-binary</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="error-message" role="alert">
            <AlertCircle aria-hidden="true" />
            {error}
          </p>
        )}

        <Button className="btn btn--solid btn--block" type="submit">
          Let&rsquo;s go
        </Button>

        <Button className="text-action" variant="ghost" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      </form>
    </section>
  )
}

function Quiz({ question, index, total, onAnswer, isCalculating, moveFocus }) {
  const progress = ((index + 1) / total) * 100
  const number = String(index + 1).padStart(2, '0')
  const firstOption = React.useRef(null)
  const calculating = React.useRef(null)

  // Every question mounts a fresh option set, so the previous answer can never
  // stay ticked. Keyboard users are handed the first option instead of body.
  React.useEffect(() => {
    if (moveFocus) firstOption.current?.focus({ preventScroll: true })
  }, [moveFocus])

  // On the last answer the options unmount out from under the focused radio, so
  // focus would otherwise drop to the body for the whole of the transition.
  React.useEffect(() => {
    if (isCalculating) calculating.current?.focus({ preventScroll: true })
  }, [isCalculating])

  return (
    <section
      className="quiz"
      data-keyboard={moveFocus ? 'true' : undefined}
      aria-labelledby="question-title"
    >
      <div className="quiz__frame">
        <hr className="rule" />

        {isCalculating ? (
          <div className="calculating" role="status" ref={calculating} tabIndex={-1}>
            <Spinner data-icon="inline-start" />
            <p className="calculating__title">Cutting to your result&hellip;</p>
            <Skeleton className="calculating-skeleton" />
          </div>
        ) : (
          <>
            <Progress
              className="quiz__progress"
              value={progress}
              aria-label={`Question ${index + 1} of ${total}`}
            />
            <p className="quiz__count">
              <b>{number}</b>
              <span>/ {total}</span>
            </p>
            {/* The counter alone leaves touch and screen-reader users who never
                take focus with no idea what changed, so the question rides along. */}
            <p className="sr-only" role="status" aria-live="polite">
              Question {index + 1} of {total}. {question?.text}
            </p>

            <p className="label quiz__kicker">A movie you spot on the shelf&hellip;</p>
            <h1 className="quiz__title" id="question-title">
              {question.text}
            </h1>
            <p className="quiz__prompt">Would you watch it?</p>

            <fieldset className="answer-grid">
              <legend className="sr-only">How much does this sound like you?</legend>
              {answerLabels.map((label, answerIndex) => (
                <label
                  className={`answer ${answerIndex === answerLabels.length - 1 ? 'answer--final' : ''}`}
                  key={label}
                >
                  <input
                    ref={answerIndex === 0 ? firstOption : undefined}
                    type="radio"
                    name="answer"
                    value={answerIndex + 1}
                    onChange={() => onAnswer(answerIndex + 1)}
                  />
                  <span className="answer__dot" aria-hidden="true" />
                  <span className="answer__label">{label}</span>
                  <span className="answer__scale" aria-hidden="true">
                    {answerIndex + 1}/5
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The result is four stubs on one deck: what you are, who you watch like, the
 * colour you scored second, and the way to stretch. Each stub carries its own
 * tone, so the set reads as a torn strip of tickets rather than one card
 * repeated — and each one is a complete, shareable idea on its own.
 */
function Results({ result, error, onRestart }) {
  const {
    main,
    contrast,
    archetype,
    character,
    stretchText,
    mainMovies,
    contrastMovies,
    mainGenreLine,
    contrastGenreLine,
  } = result

  const slides = [
    {
      key: 'type',
      label: 'your movie type',
      node: (
        <ResultSlip
          tone="main"
          serial="01"
          kicker="Your movie type"
          labelledBy="slip-type"
          heading={renderArchetype(archetype)}
          foot={<p className="slip__stamp">{mainGenreLine || `${mainMovies.length} films`}</p>}
        >
          <p className="slip__body-text">{main.blurb}</p>
          <PickStrip movies={mainMovies} columns={3} />
        </ResultSlip>
      ),
    },
    {
      key: 'persona',
      label: 'your character match',
      node: (
        <ResultSlip
          tone="ink"
          serial="02"
          kicker="Your character match"
          labelledBy="slip-persona"
          heading={character.name || 'No single match'}
          foot={<p className="slip__stamp">{main.descriptor}</p>}
        >
          {character.film ? (
            <p className="slip__body-text">
              You watch films the way <em>{character.name}</em> does in{' '}
              <em>{character.film}</em>.
            </p>
          ) : (
            <p className="slip__body-text">
              Every type has a match — this one just refuses to be pinned down.
            </p>
          )}
        </ResultSlip>
      ),
    },
    {
      key: 'contrast',
      label: 'your neighbouring colour',
      node: (
        <ResultSlip
          tone="contrast"
          serial="03"
          kicker="A neighbouring wavelength"
          labelledBy="slip-contrast"
          heading={renderArchetype(contrast.descriptor)}
          foot={
            <p className="slip__stamp">
              {contrastGenreLine || `${contrastMovies.length} films`}
            </p>
          }
        >
          <p className="slip__body-text">
            {contrast.name} cinema took second place. Same taste, different
            temperature.
          </p>
          <PickStrip movies={contrastMovies} columns={3} />
        </ResultSlip>
      ),
    },
    {
      key: 'stretch',
      label: 'how to stretch',
      node: (
        <ResultSlip
          tone="paper"
          serial="04"
          kicker="Stretch your taste"
          labelledBy="slip-stretch"
          heading={`Try ${contrast.name} next.`}
          foot={
            <ShareButton
              className="btn--outline"
              label="Share result"
              text={`I’m a ${archetype} — find out what kind of movie watcher you are.`}
            />
          }
        >
          <p className="slip__body-text">{stretchText}</p>
        </ResultSlip>
      ),
    },
  ]

  /* Three candidate decks, chosen by `?deck=` so the comparison is live rather
     than reconstructed from memory. `scroll` is the incumbent scroll-snap deck,
     `a` is Swiper below 1024px with the grid above it, `b` is Swiper everywhere. */
  return (
    <div className="results">
      <ResultsDeck slides={slides} />

      {error && (
        <p className="error-message" role="status">
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="results__footer">
        <div className="results__actions">
          <Button className="btn btn--solid" onClick={onRestart}>
            Take it again
            <ArrowUpRight aria-hidden="true" />
          </Button>
          <CopyLinkButton />
        </div>

        {/* TMDB requires this wherever their artwork appears, so it sits under
            the deck that holds the posters rather than inside any one stub. */}
        <p className="attribution">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </div>
  )
}

export default App
