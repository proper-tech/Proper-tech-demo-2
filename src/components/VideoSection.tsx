'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

// The 38-second flight round the complex, rendered from the site's own 3D model (scripts/build-film.py);
// the same file loops silently behind the home page's hero.
const VIDEO_SRC = '/media/film.mp4';
const POSTER_SRC = '/media/film-poster.jpg';

export function VideoSection() {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);

  return (
    <section className="video" id="video">
      <div className="video-text">
        <h2>{t.home.videoHeading}</h2>
        <p>{t.home.videoLead}</p>
        <p className="note">{t.home.videoNote}</p>
      </div>
      <div className="video-frame">
        {playing ? (
          <video src={VIDEO_SRC} poster={POSTER_SRC} controls autoPlay playsInline />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} style={{ backgroundImage: `url(${POSTER_SRC})` }}>
            <span className="play">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t.home.playVideo}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
