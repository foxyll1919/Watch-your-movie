/**
 * TMDB artwork URLs. The API returns the raw path (e.g. "/abc123.jpg"); the
 * width is a decision of the surface showing it, so it lives here.
 */

const TMDB_IMAGE = "https://image.tmdb.org/t/p";

/** Result-card thumbnails, which sit inside a fixed-height pick row. */
export const POSTER_THUMB = "w185";

/** Contrast-grid posters, in a 2:3 card around a third of the frame wide. */
export const POSTER_CARD = "w342";

/** Returns a full poster URL, or null when the film has no artwork. */
export function posterUrl(path, size) {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const relative = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${TMDB_IMAGE}/${size}${relative}`;
}

export default posterUrl;