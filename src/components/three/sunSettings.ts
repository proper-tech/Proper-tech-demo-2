// Sun panel settings, kept apart from Sun.tsx so pages can use them without loading three.js.

/** Where the sun is and how bright the scene is, as set by the sun panel (SunPanel.tsx). */
export interface SunSettings {
  /** Compass direction the sun shines from, in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth: number;
  /** Height of the sun above the horizon, in degrees. */
  elevation: number;
  /** Overall brightness, 1 = normal. */
  brightness: number;
  /** How far through the day the sun is: 0 at sunrise, 1 at sunset. In the overview the sun
   *  is drawn crossing the picture over the apartments, left at sunrise, right at sunset. */
  dayFraction?: number;
}

/** Late-morning sun from the south-east, so the default view shows the towers' shadows. */
export const DEFAULT_SUN: SunSettings = { azimuth: 140, elevation: 38, brightness: 1 };
