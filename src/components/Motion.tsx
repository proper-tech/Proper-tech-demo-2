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
      // The dive from orbit onto the site (page.tsx): its pictures come with the flight, not with the page.
      const dive = story.querySelector<HTMLElement>('.story-dive');
      const earthBox = dive?.querySelector<HTMLElement>('.dive-earth');
      const earth = dive ? [...dive.querySelectorAll<HTMLImageElement>('.dive-earth img')] : [];
      const loadDive = () =>
        earth.forEach((img) => {
          if (!img.srcset && img.dataset.srcset) img.srcset = img.dataset.srcset;
        });
      const startFlight = () => {
        loadDive();
        if (flight.preload === 'auto') return;
        if (flight.dataset.poster) flight.poster = flight.dataset.poster;
        flight.preload = 'auto';
        flight.load();
      };
      const stage = story.querySelector<HTMLElement>('.story-stage');
      const playing = () => stage?.classList.add('is-playing');
      hero?.addEventListener('playing', playing, { once: true });
      // The dive itself: on the way down from the intro to the first chapter, the stage leaves the sunset and
      // drops from orbit onto the site, through the satellite pictures one after another (each a quarter of the
      // ground of the one before, so picture z shows at scale 2^(Z - z) for a camera at zoom Z), turning slowly
      // to the flight's heading, warming towards the sunset and closing into a haze; the flight's first frame comes
      // up out of it, settling from a slight zoom, and the first chapter's caption arrives. It plays on its own
      // clock (a chapter's glide lasts well under a second, far too quick for this), once each time the visitor
      // comes down from the intro, and gives way at once if they scroll back up or on past the first chapter.
      // Without its pictures loaded yet, the flight simply fades in as before.
      const places = dive ? [...dive.querySelectorAll<HTMLElement>('.dive-place span')] : [];
      const altitude = dive?.querySelector<HTMLElement>('.dive-alt');
      const warm = dive?.querySelector<HTMLElement>('.dive-warm');
      const haze = dive?.querySelector<HTMLElement>('.dive-haze');
      const levels = earth.map((img) => Number(img.dataset.z));
      const DIVE_MS = 5600;
      /** The flight's heading in its first frame: the picture is turned so that this bearing is up. */
      const HEADING = 26.3;
      /** Where each place's name shows, in camera zoom. */
      const PLACE_ZOOM: [number, number][] = [
        [4.6, 7.4],
        [8.2, 11.3],
        [12, 14.8],
      ];
      const metresPerPixel = (z: number) => (156543.03 * Math.cos((47.928 * Math.PI) / 180)) / 2 ** z;
      const smooth = (x: number) => {
        const c = Math.min(1, Math.max(0, x));
        return c * c * (3 - 2 * c);
      };
      let diveSize = 0;
      let diveClock = 0;
      let diveStart = 0;
      let diveEnding = 0;
      let lastFade = -1;
      const sizeDive = () => {
        diveSize = Math.ceil(1.3 * Math.hypot(innerWidth, innerHeight));
        dive?.style.setProperty('--dive-size', `${diveSize}px`);
      };
      const diveReady = () => earth.length > 0 && earth.every((img) => img.complete && img.naturalWidth > 0);
      const clearDive = () => {
        cancelAnimationFrame(diveClock);
        clearTimeout(diveEnding);
        diveClock = diveEnding = 0;
        story.removeAttribute('data-diving');
        story.style.removeProperty('--land');
        if (dive) {
          dive.style.opacity = '';
          dive.style.transition = '';
        }
      };
      const diveFrame = (now: number) => {
        if (!dive || !earthBox) return;
        const p = Math.min(1, (now - diveStart) / DIVE_MS);
        // the descent: slow off the mark, quickest in the middle, easing onto the ground by 90% of the way
        const q = Math.min(1, p / 0.9);
        const Z = 4.6 + (15.9 - 4.6) * (0.5 - 0.5 * Math.cos(Math.PI * q));
        earth.forEach((img, i) => {
          const s = 2 ** (Z - levels[i]);
          const op = i === 0 ? 1 : smooth((Z - levels[i] + 1.7) / 1.0);
          const next = levels[i + 1];
          const covered = next !== undefined && 2 ** (Z - next) >= 0.85 && smooth((Z - next + 1.7) / 1.0) >= 1;
          img.style.visibility = op <= 0 || covered ? 'hidden' : 'visible';
          img.style.opacity = op.toFixed(3);
          img.style.transform = `scale(${s.toFixed(4)})`;
        });
        earthBox.style.transform = `rotate(${(HEADING * smooth((Z - 10) / 5.5)).toFixed(2)}deg)`;
        earthBox.style.filter = p > 0.8 ? `blur(${(smooth((p - 0.8) / 0.1) * 4).toFixed(1)}px)` : '';
        places.forEach((el, i) => {
          const [a, b] = PLACE_ZOOM[i];
          const o = Math.min(smooth((Z - a) / 0.5), smooth((b - Z) / 0.5));
          el.style.opacity = o.toFixed(3);
          el.style.transform = `translateY(${((1 - o) * 6).toFixed(1)}px)`;
        });
        if (altitude) {
          const km = (innerWidth * ((2400 * metresPerPixel(Z)) / diveSize) * 0.87) / 1000;
          altitude.textContent = km >= 10 ? `${Math.round(km).toLocaleString('en-US')} km` : km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
        }
        if (warm) warm.style.opacity = (smooth((p - 0.55) / 0.3) * 0.55).toFixed(3);
        if (haze) haze.style.opacity = smooth((p - 0.78) / 0.12).toFixed(3);
        // in from the sunset over the first 0.4 s; out of the haze onto the flight over the last tenth
        dive.style.opacity = Math.min(smooth((now - diveStart) / 400), 1 - smooth((p - 0.9) / 0.1)).toFixed(3);
        story.style.setProperty('--land', (1 + 0.08 * (1 - smooth((p - 0.88) / 0.12))).toFixed(4));
        if (p < 1) diveClock = requestAnimationFrame(diveFrame);
        else clearDive();
      };
      const startDive = () => {
        if (!dive || !diveReady()) {
          loadDive();
          return;
        }
        sizeDive();
        story.setAttribute('data-diving', '');
        diveStart = performance.now();
        diveClock = requestAnimationFrame(diveFrame);
      };
      const leaveDive = () => {
        if (!dive || diveEnding) return;
        cancelAnimationFrame(diveClock);
        dive.style.transition = 'opacity 250ms ease';
        dive.style.opacity = '0';
        story.style.removeProperty('--land');
        diveEnding = window.setTimeout(clearDive, 260);
      };
      const onFade = (fade: number, legs: number) => {
        const diving = story.hasAttribute('data-diving');
        if (diving && (fade < 0.02 || legs > 0.25)) leaveDive();
        else if (!diving && lastFade >= 0 && lastFade <= 0.04 && fade > 0.04 && legs < 0.25) startDive();
        lastFade = fade;
      };
      addEventListener('resize', sizeDive);
      off.push(() => {
        removeEventListener('resize', sizeDive);
        clearDive();
      });
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
        onFade(fade, k);
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
