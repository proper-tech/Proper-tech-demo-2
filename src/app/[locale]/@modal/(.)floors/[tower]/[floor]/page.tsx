import FloorPage from '../../../../floors/[tower]/[floor]/page';
import { FloorOverlay } from '@/components/FloorOverlay';

// A floor opened from the home page (the 3D building) shows over it instead of replacing it, so
// "back" returns to the building as it was: same view, still in full screen, nothing reloaded.
// Opened directly (a link, a refresh) the floor has its own page, floors/[tower]/[floor].
export { generateStaticParams, generateMetadata } from '../../../../floors/[tower]/[floor]/page';
export const dynamicParams = false;

export default function FloorOverHome(props: Parameters<typeof FloorPage>[0]) {
  return (
    <FloorOverlay>
      <FloorPage {...props} />
    </FloorOverlay>
  );
}
