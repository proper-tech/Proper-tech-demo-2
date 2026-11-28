import type { Finish } from './types';

/** The furnished models' colours: oak flooring, white walls, navy textiles, oak furniture and white kitchen
 *  cabinets. (They were the first choices of a finishes picker that has since left the apartment page.) */
export const defaultFinish: Finish = {
  floor: '#C9A57A',
  wall: '#F4F3EF',
  fabric: '#2C3E5C',
  wood: '#C2A078',
  cabinet: '#F1F0EC',
};

/** Sold and reserved apartments are drawn as a plain grey model on the floor plan. */
export const mutedFinish: Finish = {
  floor: '#C3CAD2',
  wall: '#D5DAE0',
  fabric: '#AEB6C0',
  wood: '#B8BFC8',
  cabinet: '#B8BFC8',
};
