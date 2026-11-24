'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

// The 38-second flight round the complex, rendered from the site's own 3D model (scripts/build-film.py),
// full screen. It plays by itself, muted and looping, while it is on screen, and pauses when it leaves.
// The file is only fetched once the section comes near. Visitors who ask for reduced motion get the
// poster and the player's own controls instead.
const VIDEO_SRC = '/media/film.mp4';
const POSTER_SRC = '/media/film-poster.webp';

export function VideoSection() {
  const { t } = useI18n();
  const box = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [still, setStill] = useState(false);
  const inView = useRef(false);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStill(true);
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
        // on screen for at least half of it: play; otherwise pause (no decoding off screen)
        inView.current = e.intersectionRatio >= 0.5;
        const v = video.current;
        if (!v?.getAttribute('src')) return; // the effect below starts it once the file is set
        if (inView.current) v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: [0, 0.5, 1] },
    );
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);

  // the file is set now: start it if the section is already on screen (a jump straight to it)
  useEffect(() => {
    if (near && !still && inView.current) video.current?.play().catch(() => undefined);
  }, [near, still]);

  return (
    <section className="video" id="video" ref={box}>
      <video
        ref={video}
        className="video-film"
        src={near ? VIDEO_SRC : undefined}
        poster={POSTER_SRC}
        muted
        loop
        playsInline
        preload="none"
        controls={still}
      />
      <div className="video-text">
        <h2>{t.home.videoHeading}</h2>
        <p>{t.home.videoLead}</p>
        <p className="note">{t.home.videoNote}</p>
      </div>
    </section>
  );
}
