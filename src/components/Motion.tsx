'use client';

import { useEffect } from 'react';

// The home page's motion layer:
//   - the header floats over the film and turns solid once the film's chapters have scrolled past;
//   - the dots beside the film follow the chapter you are reading (html .story[data-at]);
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
