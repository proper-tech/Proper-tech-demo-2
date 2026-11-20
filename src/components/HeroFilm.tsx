'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The film behind the home page's opening chapters. The poster shows at once; the video itself
 * (4.5 MB) is only requested once the page has finished loading and the browser is idle, so it
 * never competes with the text, fonts and code of the first paint. With Data Saver on, or when
 * reduced motion is asked for, the poster stays.
 */
export function HeroFilm({ src, poster }: { src: string; poster: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(false);

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let idle = 0;
    const go = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      idle = ric ? ric(() => setStart(true), { timeout: 2000 }) : window.setTimeout(() => setStart(true), 300);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      window.removeEventListener('load', go);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (cic) cic(idle);
      else clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    if (start) video.current?.play().catch(() => undefined);
  }, [start]);

  return <video ref={video} className="story-film" src={start ? src : undefined} poster={poster} muted loop playsInline preload="none" aria-hidden="true" />;
}
