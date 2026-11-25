'use client';

import { useEffect } from 'react';

// The home page's motion layer:
//   - the header floats over the film and turns solid once the film's chapters have scrolled past;
//   - the dots beside the film follow the chapter you are reading (html .story[data-at]);
//   - the drone flight behind the chapters plays as you scroll (its frames follow the scroll position);
//   - everything marked .fx fades up out of a slight blur as it comes into view, siblings one after
//     another, and numbers marked data-count count up to their value.
// Nothing moves for visitors who ask for reduced motion: the pre-paint script in the layout only adds
// html.js-motion when motion is fine, every hidden-until-revealed style hangs off that class, and the film
// is paused. Mount it last on the page so its effect runs after hydration.

export function Motion() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('js-motion')) {
      document.querySelectorAll<HTMLVideoElement>('video[autoplay]').forEach((v) => v.pause());
      return;
    }
    html.classList.add('motion-ok'); // tells the layout's failsafe that the reveals are running
    const off: (() => void)[] = [];

    // header: solid once the story (film and chapters) is behind it; the chapter across the middle of the
    // screen lights its dot (worked out on each scroll: five boxes, cheaper than it sounds and never late)
    const story = document.querySelector<HTMLElement>('.story');
    const chapters = [...document.querySelectorAll<HTMLElement>('.story-chapter')];
    const onScroll = () => {
      html.toggleAttribute('data-scrolled', story ? story.getBoundingClientRect().bottom < 72 : scrollY > 40);
      const mid = innerHeight / 2;
      const at = chapters.find((c) => {
        const r = c.getBoundingClientRect();
        return r.top <= mid && r.bottom > mid;
      });
      if (at && story) story.dataset.at = at.dataset.chapter;
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    off.push(() => {
      removeEventListener('scroll', onScroll);
      html.removeAttribute('data-scrolled');
    });

    // the flight behind the chapters: its frames follow the scroll. Chapter n's screen shows the flight's
    // n-th waypoint, so scrolling from one chapter to the next flies that leg; on the way down from the intro it
    // fades in over the sunset loop (--flight), which then pauses. --p fills the rail.
    const flight = document.querySelector<HTMLVideoElement>('.story-flight');
    const hero = document.querySelector<HTMLVideoElement>('.story-film');
    const intro = document.querySelector<HTMLElement>('.story-intro');
    const legs = [...document.querySelectorAll<HTMLElement>('.story-leg')];
    if (story && flight && intro && legs.length > 1) {
      let want = 0;
      let frame = 0;
      const seek = () => {
        // one seek at a time: setting currentTime again mid-seek makes it start over and lag
        if (flight.readyState >= 1 && !flight.seeking && Math.abs(flight.currentTime - want) > 1 / 60) flight.currentTime = want;
      };
      const update = () => {
        frame = 0;
        const top = (el: HTMLElement) => el.getBoundingClientRect().top + scrollY;
        const y = scrollY;
        const stops = legs.map(top);
        const fade = Math.min(1, Math.max(0, (y - top(intro)) / (stops[0] - top(intro))));
        let k = 0; // legs flown so far, fractional
        for (let i = 0; i < stops.length - 1; i++) {
          if (y >= stops[i + 1]) k = i + 1;
          else if (y > stops[i]) k = i + (y - stops[i]) / (stops[i + 1] - stops[i]);
        }
        story.style.setProperty('--flight', fade.toFixed(3));
        story.style.setProperty('--p', (k / (stops.length - 1)).toFixed(4));
        if (flight.duration) want = (k / (stops.length - 1)) * flight.duration;
        seek();
        if (hero) {
          if (fade >= 1 && !hero.paused) hero.pause();
          else if (fade < 1 && hero.paused && html.classList.contains('js-motion')) hero.play().catch(() => {});
        }
      };
      const onFlightScroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      update();
      addEventListener('scroll', onFlightScroll, { passive: true });
      addEventListener('resize', onFlightScroll);
      flight.addEventListener('seeked', seek);
      flight.addEventListener('loadedmetadata', update);
      off.push(() => {
        removeEventListener('scroll', onFlightScroll);
        removeEventListener('resize', onFlightScroll);
        flight.removeEventListener('seeked', seek);
        flight.removeEventListener('loadedmetadata', update);
        cancelAnimationFrame(frame);
      });
    }

    // reveals: only what is still below the fold waits for its turn (no flicker on a mid-page reload)
    const count = (el: HTMLElement) => {
      const to = Number(el.dataset.count);
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1200);
        el.textContent = Math.round(to * (1 - (1 - k) ** 3)).toLocaleString('en-US');
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(count);
          io.unobserve(e.target);
        }),
      // starts as a section begins to slide in, so it has finished by the time the page lands on it
      { rootMargin: '0px 0px 15% 0px' },
    );
    document.querySelectorAll<HTMLElement>('.fx').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight * 0.9) return;
      el.classList.add('rv');
      el.style.setProperty('--i', String([...el.parentElement!.children].indexOf(el) % 4));
      io.observe(el);
    });
    off.push(() => io.disconnect());

    return () => off.forEach((f) => f());
  }, []);

  return null;
}
