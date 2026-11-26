import type { Finish } from './types';

export type FinishKey = keyof Finish;

/** Swatches offered in the "Finishes" panel. `id` is the translation key. */
export const finishOptions: Record<FinishKey, { id: string; color: string }[]> = {
  floor: [
    { id: 'oak', color: '#C9A57A' },
    { id: 'ash', color: '#DDD0B9' },
    { id: 'walnut', color: '#7A5236' },
    { id: 'greyOak', color: '#9E9B93' },
  ],
  wall: [
    { id: 'white', color: '#F4F3EF' },
    { id: 'sand', color: '#E6DCCB' },
    { id: 'sage', color: '#CBD5C6' },
    { id: 'mist', color: '#CFDCE8' },
    { id: 'rose', color: '#E2C9BF' },
  ],
  fabric: [
    { id: 'navy', color: '#2C3E5C' },
    { id: 'amber', color: '#D49A2A' },
    { id: 'moss', color: '#5F7052' },
    { id: 'stone', color: '#A8A6A0' },
    { id: 'brick', color: '#A8503A' },
  ],
  wood: [
    { id: 'oak', color: '#C2A078' },
    { id: 'walnut', color: '#6B4930' },
    { id: 'black', color: '#2B2C2E' },
    { id: 'white', color: '#EDEBE6' },
  ],
  cabinet: [
    { id: 'white', color: '#F1F0EC' },
    { id: 'sage', color: '#7E9079' },
    { id: 'navy', color: '#24364F' },
    { id: 'graphite', color: '#3C4046' },
  ],
};

export const defaultFinish: Finish = {
  floor: finishOptions.floor[0].color,
  wall: finishOptions.wall[0].color,
  fabric: finishOptions.fabric[0].color,
  wood: finishOptions.wood[0].color,
  cabinet: finishOptions.cabinet[0].color,
};

/** Sold and reserved apartments are drawn as a plain grey model on the floor plan. */
export const mutedFinish: Finish = {
  floor: '#C3CAD2',
  wall: '#D5DAE0',
  fabric: '#AEB6C0',
  wood: '#B8BFC8',
  cabinet: '#B8BFC8',
};
