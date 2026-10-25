# Indore Yatra app

An offline Android app (installable web app) for the 7 to 12 November trip: stops with odometer readings, city-wise expenses, city-wise photos, and a sync button for the 4 phones.

No build step and no packages. The folder is plain HTML, CSS and JavaScript.

## What it does

| Screen | What you can do |
| --- | --- |
| Stops | The 6-day plan is preloaded. Tap **+ KM** on any stop to record the odometer reading (time is filled in). Tap a stop to edit or delete it. **+** adds a stop, including small ones inside a city (fuel, lunch, Rajwada). Drag the ⋮⋮ handle to reorder; dropping under another day moves the stop to that day. A reading lower than the previous one is rejected.  Stays have Contact person and Phone fields; tap the number to call. |
| Expenses | Add, edit and delete expenses with amount, category, city, date, paid by and a note. Any date works (Other date), e.g. a bus advance paid before the trip. Filter by city, or tap Bus to see bus advance, balance, fuel, toll and parking together. Drag to reorder; dropping under another city moves the expense there. The three advances already paid are preloaded. |
| Photos | **+** takes or picks photos; they are filed under the current city (the city of the last km reading). Tap a photo to change its city, add a caption, share or delete it. **Share** sends all of one city's photos, for example to the family WhatsApp group. |
| Summary | Km driven against plan, per day; bus costs; spend by city, by category and by person; CSV export of expenses and the km log. |
| Sync | Cloud sync on one tap (Supabase), or a sync file shared over WhatsApp and imported on the other phone. |

## How sync works

- Every stop and expense has its own id and the time it was last changed. When two phones disagree, the newest change wins, record by record. Deletes sync too.
- Everything works offline. Entries wait on the phone until you tap Sync.
- Photos are not synced (they are large on mobile data). Use Share in the Photos screen.
- The cloud copy never lets an older phone overwrite a newer edit (see `supabase/setup.sql`).

## Run it on your PC

```
cd trip-app
npx http-server -p 8080 -c-1
```

Open http://localhost:8080 in Chrome. Press F12 and turn on the phone view (Ctrl+Shift+M) to see it at phone size.

## Put it on the phones (GitHub Pages)

1. Create a GitHub repository, for example `yatra-app`, and push this folder to it.
2. In the repository: Settings > Pages > Deploy from branch > `main` / root > Save.
3. Open the Pages link in Chrome on each phone, tap the ⋮ menu > **Add to Home screen** (or Install app).
4. Open it once while online. After that it works with no internet.

The repository is public on a free GitHub account, so anyone with the link can see the app code. Dharamshala phone numbers are left out of the code on purpose; add them as notes on the phones. Your trip entries are not in the code; they live on the phones and in your Supabase project.

When the app files change, bump `VERSION` in `sw.js` so the phones pick up the new version on their next open.

## Set up cloud sync (Supabase)

1. Create a free project at supabase.com.
2. SQL Editor > New query > paste `supabase/setup.sql` > Run.
3. Click **Connect** at the top of the project (or Project Settings > Data API) for the **Project URL**, and Project Settings > API Keys for the **publishable** (or legacy **anon public**) key.
4. On each phone: Sync screen > Supabase settings > paste both, keep the trip code `indore-2026` the same on all phones > Save.
5. Tap **Sync now** (or the ⟳ button at the top) whenever you have signal.

The anon key only allows reading and the newest-wins update; keep the link and key within the family.
