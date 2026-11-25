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
  // paging: one turn of the wheel (or one trackpad swipe) goes to the next section, the same ones the CSS
  // snaps to (globals.css, "the home page pages"). On a desktop screen each section is one screen; where one
  // is taller (phones, short windows) it is paged through a screen at a time first. Touch and keys are left
  // to the CSS snapping.
  useEffect(() => {
    const html = document.documentElement;
    const stops = () => {
      const pad = parseFloat(getComputedStyle(html).scrollPaddingTop) || 0;
      return [...document.querySelectorAll<HTMLElement>('.home .story-chapter, .home > section:not(.story), .home .picker')].map((el) => {
        const top = el.getBoundingClientRect().top + scrollY - (el.classList.contains('story-chapter') ? 0 : pad);
        return { top, end: top + el.offsetHeight + (el.classList.contains('story-chapter') ? 0 : pad) };
      });
    };
    let busy = false;
    let quiet = 0;
    // where the page is sliding to, so a second step goes on from there; forgotten after the slide (1.2 s),
    // so a jump by link, keys or scrollbar in between is never undone
    let goal: number | null = null;
    let goalAt = 0;
    const onWheel = (e: WheelEvent) => {
      // a 3D view or a tour zooming with the wheel, pinch zoom, sideways swipes, a full-screen stage: not ours
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || html.classList.contains('has-full-stage')) return;
      // a panel of its own that can still scroll this way (the floor picker's side): let it
      for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          const room = e.deltaY > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop;
          if (room > 1) return;
        }
      }
      e.preventDefault();
      // one gesture, one step: a trackpad keeps firing for a while after the swipe, so wait for it to go quiet
      clearTimeout(quiet);
      quiet = window.setTimeout(() => (busy = false), 180);
      if (busy || Math.abs(e.deltaY) < 4) return;
      busy = true;
      const max = html.scrollHeight - innerHeight;
      // still sliding to the last step's section: count from there, not from halfway
      const y = goal !== null && performance.now() - goalAt < 1200 && Math.abs(scrollY - goal) > 2 ? goal : scrollY;
      const all = stops();
      const i = all.findLastIndex((s) => s.top <= y + 2); // the section on screen
      const cur = all[i];
      const page = innerHeight * 0.85;
      const small = innerHeight * 0.3; // a move shorter than this is not worth a step: go to the next section
      let to: number;
      if (e.deltaY > 0) {
        // the rest of a tall section first, then the next section (or the footer, at the very end)
        const rest = cur ? cur.end - innerHeight - y : 0;
        to = rest > small ? Math.min(y + page, y + rest) : (all[i + 1]?.top ?? max);
      } else if (cur && y - cur.top > small) {
        to = Math.max(cur.top, y - page); // back up through the section we are in
      } else {
        const prev = all[i - 1]; // the section above: its last screen if it is tall, else its top
        to = prev ? Math.max(prev.top, prev.end - innerHeight) : 0;
      }
      goal = Math.max(0, Math.min(max, to));
      goalAt = performance.now();
      scrollTo({ top: goal, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    addEventListener('wheel', onWheel, { passive: false });
    return () => removeEventListener('wheel', onWheel);
  }, []);

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
