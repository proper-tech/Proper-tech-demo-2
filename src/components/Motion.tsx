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
      let want = 0; // the time the scroll position asks for
      let shown = 0; // the time the video is gliding through on its way there
      let primed = false; // false until the video's length is known: then it starts where the scroll is
      let frame = 0;
      let glide = 0;
      let last = 0;
      // Neither video comes with the page (16 MB between them; page.tsx): once it has loaded, the sunset loop
      // starts over its still, and the flight downloads when the browser is idle. On a slow or data-saving
      // connection the still stays and the flight waits for the first scroll, as the intro hides it anyway.
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      const thrifty = !!conn && (conn.saveData === true || /2g|3g/.test(conn.effectiveType ?? ''));
      let loaded = false;
      const startFlight = () => {
        if (flight.preload === 'auto') return;
        if (flight.dataset.poster) flight.poster = flight.dataset.poster;
        flight.preload = 'auto';
        flight.load();
      };
      const stage = story.querySelector<HTMLElement>('.story-stage');
      const playing = () => stage?.classList.add('is-playing');
      hero?.addEventListener('playing', playing, { once: true });
      let idle = 0;
      const onLoad = () => {
        loaded = true;
        if (thrifty) return;
        update();
        idle = window.setTimeout(startFlight, 1500);
      };
      addEventListener('scroll', startFlight, { passive: true, once: true });
      off.push(() => {
        removeEventListener('load', onLoad);
        removeEventListener('scroll', startFlight);
        hero?.removeEventListener('playing', playing);
        clearTimeout(idle);
      });
      // Forward, the video plays its way to the scroll's frame (rolling) rather than seeking there: a chapter is
      // 120 frames and the page glides to it in well under a second, and a browser manages only a few dozen seeks
      // a second, so seeking skipped frames by the handful and the flight jolted. Playing decodes every frame in
      // order, at up to six times speed, slowing as it nears the frame. Backward (no browser plays in reverse) and
      // for the last frames, it seeks.
      let rolling = false;
      const stopRolling = () => {
        if (!rolling) return;
        rolling = false;
        flight.pause();
        flight.playbackRate = 1;
        shown = flight.currentTime;
      };
      const seek = () => {
        // one seek at a time: setting currentTime again mid-seek makes it start over and lag
        if (rolling) return;
        if (flight.readyState >= 1 && !flight.seeking && Math.abs(flight.currentTime - shown) > 1 / 60) flight.currentTime = shown;
      };
      // A flick of the wheel moves the scroll a long way at once; jumping straight there skips a run of frames and
      // the flight stutters. Instead the video follows the scroll, closing most of the gap within a few tenths of a
      // second, so every scroll plays as continuous flight.
      const step = (t: number) => {
        const dt = last ? Math.min(t - last, 100) : 16;
        last = t;
        const gap = want - (rolling ? flight.currentTime : shown);
        // it needs frames ahead to start; once going, a moment's wait for the decoder is no reason to stop
        if (gap > 3 / 24 && (rolling || (flight.readyState >= 3 && !flight.seeking))) {
          const rate = Math.min(6, Math.max(0.5, gap / 0.22));
          if (!rolling) {
            rolling = true;
            flight.playbackRate = rate;
            flight.play().catch(() => stopRolling());
          } else if (Math.abs(flight.playbackRate - rate) > rate * 0.1) flight.playbackRate = rate;
          shown = flight.currentTime;
          glide = requestAnimationFrame(step);
          return;
        }
        stopRolling();
        shown += (want - shown) * (1 - Math.exp(-dt / 140));
        if (Math.abs(want - shown) < 1 / 48) shown = want;
        seek();
        if (shown !== want) glide = requestAnimationFrame(step);
        else glide = last = 0;
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
        if (flight.duration) {
          want = (k / (stops.length - 1)) * flight.duration;
          if (!primed) shown = want;
          primed = true;
        }
        if (shown !== want && !glide) glide = requestAnimationFrame(step);
        seek();
        if (hero) {
          if (fade >= 1 && !hero.paused) hero.pause();
          else if (fade < 1 && hero.paused && loaded && !thrifty && html.classList.contains('js-motion')) hero.play().catch(() => {});
        }
      };
      const onFlightScroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      update();
      if (document.readyState === 'complete') onLoad();
      else addEventListener('load', onLoad, { once: true });
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
        cancelAnimationFrame(glide);
        stopRolling();
      });
    }

    // The story pages: inside it, one turn of the wheel, one trackpad swipe or one key press moves a whole
    // chapter, gliding to the next one's top (the flight's waypoint). The rest of the home page scrolls freely
    // (CLAUDE.md): past the last chapter the page scrolls on as usual, and coming back up it stops at the last
    // chapter first. Touch is paged by CSS snapping on the chapters alone (globals.css, "the story pages").
    if (story && intro && legs.length > 1) {
      const stops = () => [intro, ...legs].map((el) => el.getBoundingClientRect().top + scrollY);
      const target = (down: boolean) => {
        const all = stops();
        const y = scrollY;
        const first = all[0];
        const last = all[all.length - 1];
        if (down) return y >= first - 4 && y < last - 4 ? all.find((s) => s > y + 4) : undefined;
        if (y > last + 4) return y < last + innerHeight * 0.9 ? last : undefined; // the last chapter, seen from below
        return y > first + 4 ? [...all].reverse().find((s) => s < y - 4) : undefined;
      };
      const go = (to: number) => scrollTo({ top: to, behavior: 'smooth' });
      // A trackpad swipe sends a stream of wheel events that coasts on, fading, for a second or more. Only the
      // start of a gesture moves a chapter: after a pause in the stream, a turn the other way, or a push clearly
      // harder than the fading coast it interrupts (a new swipe while the last one still coasts; waiting for a
      // pause there swallowed it, and a swipe back up did nothing). A second gesture the same way waits for the
      // slide to be over; one the other way turns it round at once.
      let lastWheel = 0;
      let lastDir = 0;
      let lastSize = 0;
      let busyUntil = 0;
      let busyDir = 0;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch zoom, sideways
        const now = performance.now();
        const dir = Math.sign(e.deltaY);
        const size = Math.abs(e.deltaY);
        const fresh = now - lastWheel > 160 || dir !== lastDir || size > lastSize * 1.6 + 4;
        lastWheel = now;
        lastDir = dir;
        lastSize = size;
        const to = target(dir > 0);
        if (to === undefined) return;
        e.preventDefault();
        if (!fresh || (now < busyUntil && dir === busyDir)) return;
        busyUntil = now + 700;
        busyDir = dir;
        go(to);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        const el = e.target as HTMLElement | null;
        if (el?.closest('input, textarea, select, button, [contenteditable], [role="slider"]')) return;
        const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
        const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
        if (!down && !up) return;
        const to = target(down);
        if (to === undefined) return;
        e.preventDefault();
        go(to);
      };
      addEventListener('wheel', onWheel, { passive: false });
      addEventListener('keydown', onKey);
      off.push(() => {
        removeEventListener('wheel', onWheel);
        removeEventListener('keydown', onKey);
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
