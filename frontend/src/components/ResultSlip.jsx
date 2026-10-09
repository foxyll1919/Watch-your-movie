import { POSTER_THUMB, posterUrl } from "../lib/tmdb";

/**
 * One cinema ticket stub. Every result in the deck is the same object: a
 * numbered stub head, a perforated tear line, a body, and a foot. The notches
 * are painted in the page colour rather than cut out, so a stub reads as a
 * punched ticket on any tone without needing a mask or an extra wrapper.
 *
 * `tone` picks the ink/ground pair from the CSS. `main` and `contrast` are the
 * saturated profile colours, `ink` is the black stub, `paper` is the white one.
 */
export function ResultSlip({
  tone = "main",
  serial,
  kicker,
  heading,
  children,
  foot,
  labelledBy,
}) {
  return (
    <article className={`slip slip--${tone}`} aria-labelledby={labelledBy}>
      <header className="slip__stub">
        <p className="slip__serial">{serial}</p>
        <p className="slip__kicker">{kicker}</p>
      </header>

      <div className="slip__perf" aria-hidden="true" />

      <div className="slip__body">
        <h2 className="slip__heading" id={labelledBy}>
          {heading}
        </h2>
        {children}
      </div>

      <div className="slip__foot">{foot}</div>
    </article>
  );
}

/**
 * A shelf of films on a stub. Posters are 2:3 by nature, so each cell holds that
 * ratio and the titles beneath are clamped, which keeps four shelves the same
 * height whatever the film names happen to be. A film with no artwork draws the
 * same box as initials rather than collapsing the row.
 */
export function PickStrip({ movies, columns }) {
  return (
    <ul
      className="strip"
      style={{ "--strip-columns": columns ?? Math.min(movies.length || 1, 3) }}
    >
      {movies.map((movie) => {
        const artwork = posterUrl(movie.poster, POSTER_THUMB);
        return (
          <li className="strip__cell" key={movie.id ?? movie.title}>
            {artwork ? (
              <img
                className="strip__thumb"
                src={artwork}
                alt=""
                width="185"
                height="278"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="strip__thumb strip__thumb--standin" aria-hidden="true">
                {initials(movie.title)}
              </div>
            )}
            <p className="strip__title">{movie.title}</p>
            <p className="strip__meta">{movie.year}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** Two letters off the title, for the cell that stands in for missing artwork. */
function initials(title) {
  return String(title)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/** Splits "The Kinetic Storyteller" so the article sets in italic, like a byline. */
export function renderArchetype(archetype) {
  const parts = String(archetype).trim().split(/\s+/);
  if (parts.length < 2) return archetype;
  const [article, ...rest] = parts;
  return (
    <>
      <em>{article}</em> {rest.join(" ")}
    </>
  );
}

/** TMDB genres arrive as ids; the deck only ever shows that they are ids. */
export function formatGenres(genres) {
  if (!Array.isArray(genres) || genres.length === 0) return null;
  return `Genre ${genres.slice(0, 3).join(" · ")}`;
}

export default ResultSlip;