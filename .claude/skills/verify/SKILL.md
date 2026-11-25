---
name: verify
description: Check a change to the Sebotse site end to end before committing - type-check, production build, then serve the build and fetch the key pages in all three languages, their share metadata and an apartment share card. Use before a commit or PR, or when asked to verify, test or check the site.
---

# Verify the site

There is no test suite; this is the check. Run every step and report each result plainly, failures with
their output.

1. **Type-check:** `npx tsc --noEmit -p .`
2. **Production build:** `npx next build`. Expect 1,048 static paths (as of 2026-11-25), 465 of them
   apartment share cards (155 apartments × 3 languages). A drop in the count means a `generateStaticParams` broke.
3. **Serve the build** on a spare port, so the dev server on 3000 is left alone:
   `npx next start -p 3107` in the background; wait until `curl -s http://localhost:3107/en` answers.
4. **Pages** (expect 200 each): `/en`, `/mn`, `/zh`, `/en/floors/B/12`, `/mn/floors/C/4`,
   `/zh/apartments/B1203`, `/en/floors/A/1`, `/en/floors/A/B1`, `/en/floors/B/17`, `/en/floors/D/2`,
   and `/en/floors/B/12?beds=1&sun=am`.
5. **Share metadata** on `/mn/apartments/B1203` and `/en/floors/B/12`: `og:title`, `og:description`,
   `og:image`, `twitter:card` = `summary_large_image`, `link rel="canonical"` and three `hreflang`
   alternates. The apartment's `og:image` must be its own `/opengraph-image` card; other pages use
   `/og/sebotse.jpg`.
6. **Share card:** fetch the apartment's `og:image` path from step 5; expect 200 `image/png`. Save it to
   the scratchpad and look at it (plan on the left, number and area on the right).
7. **Stop the server:** `pkill -f "next start -p 3107"`.

The 3D views, the share menu and the finder only run in a browser. If browser tools can reach localhost,
open the home page, a floor and an apartment and try them; if not, say they were not checked by eye.
