import React from "react";
import { Skiper48, SkiperSlide } from "./ui/skiper-ui/skiper48";

/* Below this width a stub fills the viewport and the deck is a swipeable strip.
   At or above it every stub is on screen at once, so the carousel would have
   nothing left to move and the grid takes over. */
const SLIDE_MODE = "(max-width: 639px)";

function useSlideMode() {
  const [isSlideMode, setIsSlideMode] = React.useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(SLIDE_MODE).matches,
  );

  React.useEffect(() => {
    const query = window.matchMedia(SLIDE_MODE);
    const sync = () => setIsSlideMode(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isSlideMode;
}

/**
 * The results deck. On a phone it is a swipeable strip of ticket stubs that
 * advances one stub per view, so the whole result is reachable without the page
 * ever scrolling. From 640px up the same four stubs become a grid.
 *
 * The narrow arm is the adapted Skiper 48 carousel; the wide arm is the grid.
 * Only one of the two is ever mounted — rendering both would double the DOM and
 * leave the hidden one contending for the same scroll axis.
 */
export function ResultsDeck({ slides }) {
  const isSlideMode = useSlideMode();

  if (!isSlideMode) {
    return (
      <section className="deck" aria-label="Your result">
        <div className="deck__track deck__track--grid">
          {slides.map((slide) => (
            <div
              className="deck__slide"
              key={slide.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slide.label}`}
            >
              {slide.node}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="deck" aria-label="Your result">
      <Skiper48 className="deck__swiper" spaceBetween={12} items={slides} label="Your result">
        {slides.map((slide) => (
          <SkiperSlide key={slide.key}>
            <div className="deck__cell">{slide.node}</div>
          </SkiperSlide>
        ))}
      </Skiper48>
    </section>
  );
}

export default ResultsDeck;