/** sessionStorage key: the side the building view zoomed in to a floor from (x, z of the direction, and when),
 *  so the floor page's 3D view starts from that side (BuildingScene's ZoomIn -> FloorScene). */
export const ARRIVE_KEY = 'sebotse:arrive';

/** Floor page -> apartment page: the last frame of the floor's zoom onto the apartment, shown over the apartment's
 *  3D view until that view has drawn, so the change of page doesn't show. {id, img (JPEG data URL), at} */
export const APT_POSTER_KEY = 'sebotse:apt-poster';
