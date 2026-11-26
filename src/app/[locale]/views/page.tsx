import type { Metadata } from 'next';
import { WindowViews } from '@/components/WindowViews';
import { getDict } from '@/i18n/config';
import { pageMeta } from '@/lib/meta';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale);
  return pageMeta(locale, '/views', t.views.title, t.views.description);
}

// The real view from the windows on its own page: the drone spheres in public/views, per tower and floor.
export default function ViewsPage() {
  return (
    <main className="views-page">
      <WindowViews />
    </main>
  );
}
