// Position of the sun over the site for a given date and time, from the NOAA solar
// position equations (accurate to a fraction of a degree, plenty for shadow studies).
// The site is in Ulaanbaatar; Mongolia keeps UTC+8 all year.

export const SITE_LAT = 47.918;
export const SITE_LON = 106.917;
export const SITE_UTC_OFFSET = 8;

const RAD = Math.PI / 180;

/** Day of the year, 1 = 1 January. `date` is 'YYYY-MM-DD'. */
function dayOfYear(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
}

/**
 * Sun position at local clock time `minutes` (0-1440) on `date` ('YYYY-MM-DD').
 * Returns the compass direction it shines from (0 north, 90 east) and its height above the
 * horizon in degrees (negative at night).
 */
export function sunPosition(date: string, minutes: number, lat = SITE_LAT, lon = SITE_LON, utcOffset = SITE_UTC_OFFSET) {
  const n = dayOfYear(date);
  const g = ((2 * Math.PI) / 365) * (n - 1 + (minutes / 60 - 12) / 24);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const trueSolarMinutes = minutes + eqTime + 4 * lon - 60 * utcOffset;
  const hourAngle = (trueSolarMinutes / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZenith = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD;
  const azimuth =
    (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  return { azimuth, elevation };
}

/** Sunrise and sunset (minutes after midnight, local time), or null in polar day/night. */
export function sunTimes(date: string) {
  const H = -0.833; // upper limb on the horizon, with refraction
  let rise: number | null = null;
  let set: number | null = null;
  let prev = sunPosition(date, 0).elevation;
  for (let t = 1; t <= 1440; t++) {
    const e = sunPosition(date, t).elevation;
    if (prev < H && e >= H && rise === null) rise = t;
    if (prev >= H && e < H) set = t;
    prev = e;
  }
  return { rise, set };
}

/** The sun's path across the sky on `date`, every `step` minutes while it is up. */
export function sunPath(date: string, step = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let t = 0; t <= 1440; t += step) {
    const { azimuth, elevation } = sunPosition(date, t);
    if (elevation > -0.5) out.push([azimuth, elevation]);
  }
  return out;
}

/** 'HH:MM' for minutes after midnight. */
export const clock = (minutes: number) => {
  const m = Math.round(minutes) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Today's date in Mongolia as 'YYYY-MM-DD', and the local clock time in minutes. */
export function siteNow() {
  const d = new Date(Date.now() + SITE_UTC_OFFSET * 3_600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
