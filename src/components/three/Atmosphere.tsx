'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Color } from 'three';
import { nightFactor } from './interiorGlass';
import type { SunSettings } from './sunSettings';

/**
 * What makes the street read as a place rather than a model: air and contact.
 *  - Haze: the city fades into the sky's colour with distance (pale by day, warm with a low sun, dark at night),
 *    so the complex stands out and the far blocks stop looking like a flat print.
 *  - Ambient occlusion (N8AO): soft shade where walls meet the ground, under the podium's canopies, between the
 *    towers and in the street's corners, which the sun's shadow map alone doesn't give.
 *  - A little bloom on the lit windows and street lights after dusk, and a faint vignette.
 * The effects only run on desktop-class screens (a fine pointer and a wide window); phones keep the plain view.
 */
export function Atmosphere({ sun, near = 480, far = 1700 }: { sun: SunSettings; near?: number; far?: number }) {
  const night = nightFactor(sun.elevation);
  const low = 1 - Math.min(1, Math.max(sun.elevation, 0) / 35);
  const color = useMemo(() => {
    const day = new Color('#c8d3de').lerp(new Color('#dccbb8'), low * 0.8);
    return day.lerp(new Color('#1a2030'), night);
  }, [low, night]);
  return <fog attach="fog" args={[color, near, far]} />;
}

function wantsEffects() {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('lite')) return false;
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 1000;
}

export function Effects({ sun }: { sun: SunSettings }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(wantsEffects()), []);
  const night = nightFactor(sun.elevation);
  if (!on) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={9} distanceFalloff={1.2} intensity={3.2} quality="medium" color="#1d2430" />
      <Bloom mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.25 + 0.6 * night} />
      {/* the composer switches the renderer's own tone mapping off: the same curve (Neutral) as the plain view */}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.32} />
      <SMAA />
    </EffectComposer>
  );
}
