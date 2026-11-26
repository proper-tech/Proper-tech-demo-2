import type { Metadata } from 'next';
import { DroneView } from '@/components/DroneView';

// A working page for the drone's 360° photos (public/views): not linked from the site, not for search engines.
export const metadata: Metadata = { title: 'Drone views', robots: { index: false, follow: false } };

export default function DronePage() {
  return <DroneView />;
}
