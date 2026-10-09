"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import React from "react";
import { A11y, EffectCards, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css/effect-cards";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css";

import { cn } from "@/lib/utils";

/**
 * Skiper 48 (Carousel_002) adapted for CineColor result cards.
 *
 * The upstream component is an image carousel: eleven hardcoded demo images, a
 * fixed 380x260 box, and an entrance animation. None of that survives contact
 * with the results screen, so this version:
 *
 *  - renders `children` (result stubs) instead of images, and takes no asset
 *    paths at all, so there is nothing to 404;
 *  - sizes itself from its container (`h-full` + a width floor) rather than a
 *    fixed pixel box, because the results shell locks the deck to `100dvh`;
 *  - defaults `effect` to `slide`, not `cards`. The cards effect overlays the
 *    stack behind the active slide, which hides three of the four stubs on a
 *    results screen where every stub is a complete, readable idea;
 *  - owns its own index, dots, and keyboard handling rather than using Swiper's
 *    built-in ones. Swiper's defaults are wrong here in three measurable ways —
 *    see the notes on each fix below.
 */
const Skiper48 = ({
  children,
  className,
  effect = "slide",
  spaceBetween = 16,
  label = "Your result",
  items = [],
}) => {
  return (
    <Carousel_002
      className={className}
      effect={effect}
      spaceBetween={spaceBetween}
      label={label}
      items={items}
    >
      {children}
    </Carousel_002>
  );
};

export { Skiper48 };

/* Re-exported so callers never have to reach into swiper directly. Importing
   `SwiperSlide` from "swiper/react" at the call site is the single easiest way
   to get a blank results screen: the reference is undefined, the render throws,
   and React unmounts the whole tree rather than just the carousel. */
export { SwiperSlide as SkiperSlide };

const Carousel_002 = ({
  children,
  className,
  effect = "slide",
  spaceBetween = 16,
  label = "Your result",
  items = [],
}) => {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = React.useState(0);
  const swiperRef = React.useRef(null);
  const count = React.Children.count(children);

  /* The key listener is attached once, when Swiper initialises. A function
     captured by `addEventListener` keeps the closure it was created with, so
     reassigning a ref that the handler reads at call time is not enough — the
     index has to be read from a ref as well, or every arrow press after the
     first repeats the move the handler already saw. */
  const activeRef = React.useRef(0);
  const setActiveTracked = React.useCallback((next) => {
    const value =
      typeof next === "function"
        ? next(activeRef.current)
        : Math.max(0, Math.min(count - 1, next));
    activeRef.current = value;
    setActive(value);
    return value;
  }, [count]);

  const goTo = React.useCallback(
    (index) => {
      const swiper = swiperRef.current;
      if (!swiper) return;
      const clamped = setActiveTracked(index);
      swiper.slideTo(clamped, reduceMotion ? 0 : 320);
    },
    [reduceMotion, setActiveTracked],
  );

  const onKeyDown = React.useCallback(
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const current = activeRef.current;
      const last = count - 1;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(current + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(last);
      }
    },
    [count, goTo],
  );

  /* `onKeyDown` passed as a prop to `<Swiper>` is swallowed — the component
     keeps its own handlers — so the listener is attached to the instance's
     element directly, and removed on unmount and on re-init. */
  const onSwiper = React.useCallback(
    (swiper) => {
      swiperRef.current?.el?.removeEventListener("keydown", onKeyDown);

      swiperRef.current = swiper;

      /* Swiper's a11y module parks `aria-live="polite"` on `.swiper-wrapper`,
         which wraps every stub at once. That announces roughly 700 characters —
         all four results — on each slide change. The deck wants one short line
         instead, so the wrapper is silenced and a purpose-built status region is
         rendered below. Done on init because the wrapper is created by Swiper. */
      swiper.wrapperEl.setAttribute("aria-live", "off");

      swiper.el.addEventListener("keydown", onKeyDown);
    },
    [onKeyDown],
  );

  React.useEffect(
    () => () => {
      swiperRef.current?.el?.removeEventListener("keydown", onKeyDown);
    },
    [onKeyDown],
  );

  const onSlideChange = React.useCallback(
    (swiper) => {
      setActiveTracked((current) =>
        current === swiper.activeIndex ? current : swiper.activeIndex,
      );
    },
    [setActiveTracked],
  );

  const current = items[active];

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ duration: 0.24, delay: 0.1 }}
      className={cn("skiper__frame", className)}
    >
      <Swiper
        spaceBetween={spaceBetween}
        slidesPerView={1}
        effect={effect}
        grabCursor={true}
        loop={false}
        /* No autoplay: a result is a thing the reader came to read, and it must
           not scroll away underneath them. Reduced motion is honoured by
           `goTo` passing a zero duration. */
        autoplay={false}
        a11y={{ enabled: true }}
        watchOverflow={false}
        navigation={false}
        /* Swiper's own bullets are `<span role="button">`, which loses Enter and
           Space activation and reads as a button to a screen reader only by
           promise. Real `<button>`s are rendered below instead. */
        pagination={false}
        onSwiper={onSwiper}
        onSlideChange={onSlideChange}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        className="skiper__track"
        modules={[EffectCards, Pagination, Navigation, A11y]}
      >
        {children}
      </Swiper>

      {count > 1 && (
        <div className="deck__controls">
          <button
            type="button"
            className="btn btn--icon deck__step"
            onClick={() => goTo(active - 1)}
            disabled={active === 0}
            aria-label="Previous result"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </button>

          <ol className="deck__dots">
            {items.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="deck__dot"
                  aria-current={index === active ? "true" : undefined}
                  aria-label={`${item.label}, result ${index + 1} of ${count}`}
                  onClick={() => goTo(index)}
                />
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="btn btn--icon deck__step"
            onClick={() => goTo(active + 1)}
            disabled={active === count - 1}
            aria-label="Next result"
          >
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {`Result ${active + 1} of ${count}${current ? `: ${current.label}` : ""}`}
      </p>
    </motion.div>
  );
};

export { Carousel_002 };

/**
 * Skiper 48 Carousel_002 — React + Swiper
 * Built with Swiper.js - Read docs to learn more https://swiperjs.com/
 * Illustrations by AarzooAly - https://x.com/AarzooAly
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 */