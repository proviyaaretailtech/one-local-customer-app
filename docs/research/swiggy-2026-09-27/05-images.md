# Swiggy study: images and media for the One Local customer app

Owner: imagery and media specialist, one of five agents studying Swiggy.
Scope: image sizes and shapes, text on photos, badges, placeholders, caching, moving images to Supabase Storage, what to show when a place has no photo, and the 3D icon style.
Code checked: `frontend/` on branch `feat/expo-router-api`, plus `backend/.media_build` (the 129 rebuilt files) and `backend/scripts/rebuild_media.py`. No repo file was changed.

---

## 0. The short version

1. **In a production build the app shows no images.** `server/data/media.json` is an empty `{}`, so `server/media.ts:24` never redirects anywhere. Line 25 then returns 404 whenever `NODE_ENV === 'production'`. Today images appear only because the founder's Mac streams them from `backend/.media_build`.
2. **"Some images not filling their frames" has one cause.** The catalogue puts two kinds of image in the same `image` field: cut-out packshots on a clear background (`item-*`, `float-*`, `amul-*`, 329 to 900 px) and landscape or portrait stock photos (`bread` 900×599, `milk` 667×1000). Each screen picks either `cover` or `contain` for all of them. Stock photos with `contain` get empty bars, and cut-outs with `cover` get their edges cut off.
3. **There are no placeholders anywhere.** No `<Image>` in the app sets `placeholder`, a blurhash, `recyclingKey` or `cachePolicy`, and only 5 of about 45 set a `transition`. Cards show an empty cream (or white) box until the full file arrives.
4. **Every image is one full-size file, with no size variants.** A 590 KB 900×900 PNG (`amul-butter-pack`) goes into a 43 pt cart thumbnail. The product page downloads the same full image three times, twice only to blur it.
5. **OpenStreetMap "discover" places have no photos at all.** They need a planned no-photo look: a category illustration, a monogram and a department tint, bundled inside the app.

---

## 1. Image spec per card type

How to read this:
- Pixel widths are rounded up to a small set of standard widths: **96, 160, 240, 320, 480, 640, 960, 1280**. Every screen then asks for the same few sizes, so cache hits stay high.
- @2x and @3x are the pixel widths to request on 2× and 3× phones. Height follows from the shape.
- For `contentFit`: **photo** means `cover`. **cutout** means `contain`, with about 8% padding, on a plain tinted plate.
- "Swiggy reference" is what the same slot looks like in the Swiggy notes.

| # | Card type (our file) | Shape | Size on screen (pt, 393-pt phone) | Request @2x / @3x | contentFit | Overlay / scrim | Badge positions |
|---|---|---|---|---|---|---|---|
| 1 | **Department / service tab icon** (`department-strip.tsx`, 51×47) | 1:1, clear background | 48–56 square; can grow to 64 as a Swiggy-style tall "folder tab" | 160 / 160 | contain | none; soft department-tint circle behind | "10 min" or "NEW" pill top-right, sitting 6 pt over the edge |
| 2 | **"What's on your mind" round category** (`catalog-sections.tsx` 94×91, `categories.tsx` tile at 25% width) | 1:1 circle | 72–94 | 240 / 320 | photo: cover; cutout: contain on a tint | none (label sits under the circle) | none |
| 3 | **Category sidebar thumb** (`category/[id].tsx` 49×49) | 1:1 | 49 | 160 / 160 | same rule as #2 | none | selected bar on the left edge |
| 4 | **Product card, horizontal rail** (`product-card.tsx`, 140 wide, image 112 tall) | **change to 1:1** (now 1.25:1) | 140×140 | 320 / 480 | cutout: contain with 10 pt padding on cream; photo: cover | none | discount top-left (Swiggy puts the flag top-left), heart top-right, **ADD overlapping the photo's bottom-right edge by half its height** (Swiggy dish card), veg/non-veg mark top-left above the discount for food |
| 5 | **Product card, category grid** (`subcategory-product.tsx`, 2 columns about 140 wide) | 1:1 (already) | 140×140 | 320 / 480 | same as #4 | none | heart top-right, ADD bottom-right on the photo edge, weight band below |
| 6 | **Store / restaurant card, square 3-up** (Swiggy "Top rated") | 1:1 | ~112 | 240 / 320 | cover | bottom scrim: clear to 72% black over the bottom 45% | partner badge top-left, heart top-right, offer text ("70% OFF") bottom-left in white 13 pt/800 on the scrim, "AD" tag bottom-right |
| 7 | **Store list row, large photo** (Swiggy list; our `store-rail.tsx` 118×128) | 4:5 (118×128 is close; standardise on 0.9) | 118×132 | 240 / 400→480 | cover | bottom scrim as #6 when there is offer text; none otherwise | index number top-left (current), arrow bottom-right (current), offer text bottom-left |
| 8 | **Store logo tile** (`immersive-header` 64, `index.tsx` storeImage 42, `store/[id].tsx` logo, brand circle 66) | 1:1, white plate | 42–66 | 160 / 240 | **contain** inside a white rounded tile with 12% padding (today `store/[id].tsx:124` uses cover) | 1 pt border plus a soft shadow on dark heroes | none |
| 9 | **Brand / campaign hero render** (`brand-spotlight.tsx` art 47% × 182; `food-spotlight.tsx`) | about 1:1, clear 3D render | ~185×182 | 480 / 640 | contain | none; it floats over the gradient with a soft drop shadow | sticker top-right (current) |
| 10 | **Full-bleed page header** (`immersive-header.tsx`, 340 + safe area) | about 1:1.05 (393×~390) | full width | 960 / 1280 | cover, focus on the upper third | current 4-stop scrim is right (0.55 top → 0 → 0.25 → 0.88 bottom) | logo tile bottom-left above the title, glass buttons top |
| 11 | **Promo banner** (`home-promos.tsx`, 181 tall, image on the right 62%) | about 1.3:1 image slot | ~225×181 | 480 / 640 | cover | left-to-right fade from the banner colour into the photo, so text on the left never sits on the photo | CTA bottom-left |
| 12 | **Event / booking card** (`catalog-sections.tsx` eventImage 142 tall, full width) | 16:9 (put 142 tall at 16:9 on phones up to 393 wide) | ~353×199 | 960 / 1280 | cover | bottom scrim 0→80% over the bottom 50% | date chip top-left, price bottom-right |
| 13 | **Discover / reel tile** (`discover.tsx`, 3 columns, 1:1.6) | 5:8 | ~128×205 | 320 / 400→480 | cover; **needs a portrait source** (see problems) | bottom scrim 0→75% over the bottom 40% | reel icon top-right, brand chip bottom-left |
| 14 | **Product detail gallery** (`product/[id].tsx` shotW = min(78% width, shotH)) | 1:1 | ~306 | 640 / 960 | cutout: contain; photo: cover | none | pager dots under the image |
| 15 | **Product detail blurred backdrop** (`product/[id].tsx:89,150`) | fill | full screen | **96 / 96** | cover | blur | none |
| 16 | **Cart, order and floating-cart thumbnails** (`cart.tsx` 158/179, `order/[id].tsx:213`, `orders.tsx:81`, `floating-cart.tsx` 36–44) | 1:1 | 36–56 | 160 / 160 | cutout: contain on white; photo: cover | none | qty badge top-right where used |
| 17 | **Delivery-type illustration** (Swiggy's illustrated rider) | clear, about 1.4:1 | ~96×68 | bundled in the app | contain | none | none |

Rules that apply to every card:
- **Radius:** 12 pt on photos inside cards, 16–20 pt on standalone tiles, full circle for categories.
- **Scrim over text:** never lighter than 60% black under white text of 12 pt or less. White text on a photo also gets a faint text shadow (0 1 2 rgba(0,0,0,.35)).
- **Tap targets:** the badges on photos (heart, ADD) keep their 44 pt tap area even when the visible badge is smaller.
- **Badge text:** minimum 9 pt. The discount badge in `product-card.tsx` is 7 pt today (see problems).

---

## 2. Problems found in our code

### Serving and storage
- `server/data/media.json` is `{}`, so the "published" branch at `server/media.ts:24` is dead code. Every image comes from the Mac at `server/media.ts:27-45`.
- `server/media.ts:25`: under `NODE_ENV=production`, every image returns **404**. A store build pointed at a hosted API will have no pictures until media.json is filled.
- `server/media.ts:31`: each request reads the whole file from disk with `readFileSync`. There is no ETag or Last-Modified header, so a phone can't ask "has it changed?". `Cache-Control` is one day (`:33`) and one hour on the redirect (`:24`).
- `src/api.ts:14`: `mediaUrl(key)` always builds `${API}/media/${key}`. Every image makes a trip through our API. There is no way to ask for a size, quality or format.
- `src/api.ts:16`: `resolveMedia` rewrites any `/api/media/<key>` string to that same API URL, so the choice of host is made in one place. That is good: it is the single point to change.
- `backend/.media_build/manifest.json`: 10 entries have no `content_type` (`icon-*-v2`, `vendor-*-v2`). The `.webp` extension fallback at `server/media.ts:32` saves them today. The upload step must set the type explicitly.
- `docs/CENTRAL_DB_MAP.md:3`: the shared Supabase project already has a public bucket `item-images`, which belongs to POS, and an empty table `ol_catalog_assets`. We should not put One Local files into the POS bucket (see section 3).

### Source files
- **Cut-outs are too small.** The 20 `item-*` product cut-outs are 329–330 px. A 140 pt card on a 3× phone needs 420–480 px, so they are stretched and look soft. The `float-item-*` versions are 110–283 px.
- **PNGs are far too heavy.** `amul-butter-pack` (590 KB), `amul-float` (598 KB), `tshirt` (494 KB), `headphones` (491 KB) and `sneakers` (442 KB). The same pictures as WebP would be 40–80 KB.
- **Mixed shapes in one field.** Products use 51 distinct files: square cut-outs, 3:2 landscape photos and 2:3 portraits. Nothing records which kind a file is.
- **Photos used as logos.** `stores[].logo` often points at a photo (`beauty`, `wellness`, `item-sweets`). In a round 42–66 pt logo slot this reads as a random crop, not a brand.

### Fit and cropping (the "not filling frames" finding)
- `src/components/subcategory-product.tsx:33`: `contentFit="contain"` in a square. Landscape photos (`bread`, `snacks`, `pizza`, about 900×600) show cream bars above and below.
- `app/(tabs)/categories.tsx:24`: `contain` on category photos (`fruit` 900×600, `milk` 667×1000, `vegetables` 661×1000). They show bars left/right or top/bottom.
- `app/category/[id].tsx:45` (sidebar, 49×49) and `app/collection/[id].tsx:29`: the same `contain`-on-photo problem.
- `src/components/product-card.tsx:21`: the opposite case, `cover` in a 1.25:1 frame. Square cut-outs lose their top and bottom, and portrait photos (`milk`, `lamp`) lose most of the product.
- The same product therefore looks different on the home rail (cropped) and in the category grid (letterboxed).
- `app/(tabs)/discover.tsx:22`: the tile is 1:1.6 portrait but uses `r.product.image` (square or landscape). `cover` crops away about 60% of a landscape photo.
- `app/store/[id].tsx:124`: the logo uses `cover` in a circle (`borderRadius: 46`). Real logos get their edges cut; it should be `contain` on a white plate.
- `app/(tabs)/index.tsx:26,53`, `src/components/floating-cart.tsx:29,33` and `src/components/reel-card.tsx:65` set no `contentFit` (the default is cover). These are small thumbnails, but the rule should be explicit.

### Loading, placeholders, caching
- Not one `<Image>` sets `placeholder` or blurhash/thumbhash. Card backgrounds are `colors.cream` in `product-card.tsx:28` and `subcategory-product.tsx`, but store rail, promo, event and discover tiles show a blank box, then the photo pops in.
- Only 5 call sites set `transition`: `product-card.tsx:21`, `subcategory-product.tsx:33`, `store-rail.tsx:11`, `categories.tsx:24` and `discover.tsx:22`.
- No `recyclingKey` is set. That doesn't matter while lists are FlatList or ScrollView, but it will if we move to FlashList, which is common for long discover lists: recycled cells would briefly show the previous shop's photo.
- No `Image.prefetch` anywhere. Opening a product page starts its hero download only after the screen mounts.
- `app/product/[id].tsx:89` and `:150` load the full product image again just to blur it by 50–60. A 96 px request looks identical and costs about 3% of the bytes.
- `app/(tabs)/index.tsx:26,53`, cart thumbnails and similar places: 40–56 pt thumbnails download 500–900 px originals.

### Text on photos and badges
- `src/components/product-card.tsx:28`: the discount badge `discountText` is **7 pt**, on a glass background, over a photo. It is too small to read in sunlight.
- `src/components/brand-spotlight.tsx:40`: the eyebrow is 6.5 pt, and sticker and detail text is 7 pt. These are decorative, but under the 9 pt floor.
- `src/components/immersive-header.tsx:22`: the scrim is well tuned; reuse its stops as a shared token. `src/components/home-promos.tsx:39` uses `overlayDeep` (0.85) as a separate gradient. Both should come from one set of `scrim` tokens.
- `src/theme.ts:118`: there is no dark theme yet (`themes.dark` is undefined). "Dark-image legibility" is therefore about text on dark photos, not dark mode. When dark mode arrives, clear cut-outs on dark surfaces need a light plate (`colors.cream`); see the Photo component below.

### Hard-coding
- `src/components/brand-spotlight.tsx:32` swaps `amul-cutout` for `amul-float` inline and chooses `contain` or `cover` from the asset name. This is the same missing "kind" information, patched by hand.
- `src/components/department-strip.tsx:17` and `vendor-note.tsx:36` build keys by string (`icon-${id}-v2`). That is fine, but the `-v2` version belongs in the manifest, not in component code.

---

## 3. Migration plan: from the Mac to Supabase Storage

### Buckets and folders
Create two One Local buckets in the shared project. Don't reuse POS's `item-images`: ownership stays clear and one app's cleanup can't delete another's files. Bucket creation belongs in the OS repository's migration ledger, per the earlier decision that Repo-1- owns migrations.

**`ol-media`: public.** Catalogue and marketing images that anyone may see. The file name is the existing key, with no extension; the content type is set on upload.
```
ol-media/
  img/<key>                     e.g. img/burger, img/item-sweets, img/amul-float
  video/<key>                   e.g. video/reel-pasta (mp4), video/reel-pasta-webm
  icons/<key>                   icon-food-v2 … (3D department icons)
  illus/<key>                   vendor-*-v2, festival art, rider illustration
```
Later, when partners upload their own pictures, add `stores/<store_id>/…` and `products/<product_id>/…`. Uploads go through short-lived signed upload URLs issued by the API, as `BACKEND_REARCHITECTURE_PLAN.md:23` already says.

**`ol-private`: private.** Profile photos, photo-search uploads and partner documents. Files are read through signed URLs that expire after 1 hour. Signed resized links also work (`createSignedUrl(path, 3600, { transform: { width: 320 } })`).

Why public for the catalogue: public files are cached by Supabase's CDN and need no token. Signed links for catalogue images would give every picture a new URL each hour, which throws away the phone's disk cache.

### Caching headers
Upload with `cacheControl: '31536000'` (one year) and treat every key as **never changing**. To replace a picture, upload it under a new key (`burger-v2`), exactly as the icons already do. The phone's disk cache then never shows a stale picture and never has to check again.

### Resized images on request
Supabase can resize on the fly:
```
{SUPABASE_URL}/storage/v1/render/image/public/ol-media/img/<key>?width=480&quality=70&resize=contain
```
- It converts to WebP automatically when the phone accepts it. It does **not** make AVIF, and WebP is plenty.
- `resize=cover|contain|fill`. Send only `width` so the original shape is kept, and let `contentFit` on the phone do the fitting.
- Width and height must be 1–2500 px. The source file must be under 25 MB.
- **Cost caveat for the founder:** image transformations are a paid-plan feature, billed per distinct source image each month beyond a small included amount. Check the current Supabase pricing page before relying on them. **Fallback with no plan dependency:** when publishing, make fixed WebP sizes with Pillow (`<key>@160`, `@320`, `@480`, `@960`) and pick the nearest on the phone. Same client code, different URL builder.
- Videos are not transformed. Serve them from `/storage/v1/object/public/ol-media/video/<key>`. Storage supports byte-range requests, which the players need.

### Smallest code change, in two steps

**Step 1: no app release needed. The Mac is no longer needed.**
1. Add a one-off publish script, `backend/scripts/publish_media.py`, next to `rebuild_media.py`. It reads `.media_build/manifest.json` and uploads each file to `ol-media/{img|video|icons|illus}/<key>` with its content type and the one-year cache header. It then writes `frontend/server/data/media.json` as `{ key: publicUrl }`. The service key is read from `.env` on the machine and never printed.
2. `server/media.ts:24` already redirects to that URL, so nothing else changes. Optionally, pass a width through:
   ```ts
   // server/media.ts, inside serveMedia, replacing line 24
   const url = PUBLISHED[key];
   if (url) {
     const w = Number(new URL(request.url).searchParams.get('w')) || 0;
     const target = w && url.includes('/object/public/') && !key.startsWith('reel-')
       ? url.replace('/object/public/', '/render/image/public/') + `?width=${Math.min(w, 2500)}&quality=70`
       : url;
     return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'public, max-age=31536000, immutable' } });
   }
   ```
   A catalogue key never changes what it points to, so the redirect itself can be cached for a year.

**Step 2: one small app change. No trip through our API; sizes chosen per card.**
Put the storage base in `app.config.ts → extra.mediaBase`. It is public, not a secret. Then in `src/api.ts`:
```ts
const MEDIA_BASE: string = (Constants.expoConfig?.extra?.mediaBase || '').replace(/\/$/, ''); // e.g. https://<ref>.supabase.co/storage/v1
const STEPS = [96, 160, 240, 320, 480, 640, 960, 1280];
export const mediaUrl = (key: string, widthPt?: number) => {
  if (!MEDIA_BASE) return `${API}/media/${key}${widthPt ? `?w=${px(widthPt)}` : ''}`;   // dev: Mac / step 1
  if (/^reel-/.test(key)) return `${MEDIA_BASE}/object/public/ol-media/video/${key}`;
  return widthPt
    ? `${MEDIA_BASE}/render/image/public/ol-media/img/${key}?width=${px(widthPt)}&quality=70`
    : `${MEDIA_BASE}/object/public/ol-media/img/${key}`;
};
const px = (pt: number) => STEPS.find(s => s >= pt * Math.min(PixelRatio.get(), 3)) ?? 1280;
```
- `resolveMedia` (`src/api.ts:16`) keeps turning `/api/media/<key>` into `mediaUrl(key)`, the full-size URL, so every screen keeps working unchanged.
- Screens that pass a size go through the new `<Photo>` component below.
- Keep the icon and illustration folders under `img/` at first so one rule covers them. Split them later if needed.
- Dev on the Mac keeps working (no `mediaBase`, so the API path is used).

**Step 3: the `<Photo>` wrapper (src/components/photo.tsx), adopted one screen at a time.**
```ts
<Photo src={p.image} kind="auto" widthPt={140} aspect={1} />   // kind: photo | cutout | logo | icon | auto
```
It does the following:
- Works out the pixel size and adds the width to the URL.
- Picks `contentFit`: cover for photos, contain with padding on a cream plate for cut-outs and logos.
- Sets `placeholder` to the file's blurhash or main colour, `transition={150}`, `recyclingKey={src}` and `cachePolicy="memory-disk"`.
- Shows `<NoPhoto>` (section 4) if the source is missing or fails to load.

"Kind" and the placeholder need a little data. Extend `media.json` entries from a plain URL string to `{ url, w, h, kind, blurhash, color }`, and let `server/media.ts` read `.url`. That is a 2-line change. Kind can be worked out once at publish time:
- **cutout:** clear-background PNG/WebP, or keys starting `item-`, `float-`, `amul-cutout` or `amul-float`
- **logo:** keys ending `-logo`, plus the brand logos
- **icon:** `icon-*` and `vendor-*`
- **photo:** everything else

The catalogue API then sends `image_meta` next to `image` (or the phone reads a small shipped copy of media.json).

### Prefetch
- On press-in of a product card, `Image.prefetch(mediaUrl(key, 306))` for the detail hero, so it is usually ready before the screen slides in.
- After the home feed arrives, prefetch the first 6 rail images at card size.
- Keep the one-year cache headers above. expo-image's disk cache does the rest.

---

## 4. No-photo design for OpenStreetMap "discover" listings

OSM gives us name, type (`amenity`/`shop` tag), cuisine, distance, hours and phone, but never a photo. We should not fill the gap with stock food photos or photos borrowed from Google: a photo that isn't the real shop misleads customers, and Google's terms forbid storing its photos. So the empty space gets a designed look that is clearly a category, not a fake photo.

### The tile: "Category plate"
Layers, back to front:
1. **Tinted gradient background** in the department colour, using the existing tokens: food → `foodSoft`, grocery → `groceryFade`, shops → `shopsFade`, care → `beautySoft`. It runs diagonally from the soft tint to 60% of it. A hash of the place's `id` picks one of **3 angle and shade variants**, so a list of 40 cafés doesn't look like one tile repeated.
2. **3D category illustration**, centred, taking up 62% of the tile, in the same clay style as the department icons. It is chosen from the OSM type (table below).
3. **Monogram chip**, bottom-left: a white rounded square (the same look as `immersive-header.tsx` `logoTile`). It shows the first one or two letters of the name in the department ink colour at 800 weight. Use `Array.from(name)` for Devanagari and other non-Latin names, and skip words like "Shri", "The" and "New".
4. **No text over the illustration.** The name, type, distance and status go below the tile, or beside it in a list row.

Status and credit, shown under the name: a grey pill "Not on One Local yet", and small "© OpenStreetMap" text at the bottom of the list, as `nearby.ts` already requires. Add a "Request this shop" button to tie it to launch requests. Later, add "Own this shop? Add photos" for partner claims; claimed shops switch to real photos.

### Illustration set: 16 files, bundled in the app, not downloaded
| Group | OSM types | Illustration |
|---|---|---|
| food | restaurant, food_court | thali plate |
| food | cafe | chai cup and saucer |
| food | fast_food | vada pav / burger |
| food | bakery, confectionery | bread loaf and bun |
| food | sweets, ice_cream | laddoo box / cone |
| grocery | supermarket, general, convenience, grocery | shopping basket with packs |
| grocery | greengrocer | vegetable crate |
| grocery | dairy | milk can and paneer |
| grocery | butcher, frozen_food | wrapped parcel with ice |
| shops | clothes, boutique, shoes, bag | folded kurta and shoe |
| shops | electronics, mobile_phone | phone and earbuds |
| shops | jewelry, gift | gift box / bangle |
| shops | books, stationery | notebook and pencil |
| shops | hardware, furniture, department_store, mall, sports, optician | storefront awning (the default for shops) |
| care | pharmacy, chemist, clinic, hospital, doctors, dentist | medicine bottle and cross |
| care | beauty, cosmetics, hairdresser | comb and lipstick |

- Each file is a 512 px master, exported as 240 px WebP, about 8–15 KB, so all 16 add about 200 KB to the app. They work offline and cost no network.
- Put them in `frontend/assets/placeholders/` and load them with `require()`. There is no reason to host them.
- An unknown type falls back to its group's default (thali, basket, awning or bottle).

### Where it appears
- **List row:** a 72×72 tile, radius 14.
- **Square card:** 1:1, same as card #6, without the scrim because there is no offer text.
- **Place detail header:** reuse `ImmersiveHeader` with a gradient in place of the photo. The large illustration sits on the right, and the name uses dark text, since the background is light.
- **Map pin:** the illustration in a 28 pt circle.

The same `<NoPhoto kind department name id />` also covers any **catalogue** image that fails to load, instead of a blank box.

---

## 5. 3D and illustrated icon style for our departments

What we have: `icon-{food,grocery,shops,care,book-it}-v2` are 384 px clay-style WebP files, and there are 5 `vendor-*-v2` character illustrations. Swiggy uses tall "folder" tabs with 3D icons that stick up above the tab, plus 3D food renders floating in the campaign hero.

The style to lock in, so every new icon matches:
- **Material:** soft matte clay, with a slight shine on edges only. No glassy reflections.
- **Light:** key light from top-left at 45°, a soft shadow falling bottom-right, and a thin pale rim light. The same on every icon.
- **Camera:** three-quarter view, about 20° from above. The object fills 80% of the frame, with 10% clear margin on each side for the pill badges.
- **Colour:** one main hue per department, taken from `theme.ts` (food orange, grocery green, shops purple/blue, care pink, Book It blue), plus warm neutrals. No black outlines.
- **Indian subjects first:** thali, chai, kirana basket, kurta and pharmacy bottle, rather than burgers and pizza, which Swiggy already owns visually.
- **Files:** a 1024 px master with a clear background, published at 160 and 240 px WebP. Name them `icon-<dept>-v3`; don't overwrite, because the keys never change (section 3).
- **One family:** the department icons, the 16 no-photo illustrations, the delivery-type rider and empty-state art should come from the same generator settings or the same artist. Mixed families are the main thing that makes an app look "assembled".
- **Tabs:** follow Swiggy's pattern. The selected department's icon grows about 10% and sits 8 pt above the tab edge; the tab turns white and merges into the page below. `department-strip.tsx:17` already has the tilt animation.

---

## 6. Top 8 changes, ranked by value (S = under a day, M = 1–3 days, L = a week or more)

1. **(S) Publish the 129 files to Supabase `ol-media` and fill `media.json`.** Production builds then show images, and the Mac is no longer needed. No app code changes (section 3, step 1). This one is blocking.
2. **(S) Fix fit rules by kind.** Record `kind` per file at publish time. Photos use cover and cut-outs use contain on cream, in `product-card.tsx:21`, `subcategory-product.tsx:33`, `categories.tsx:24`, `category/[id].tsx:45`, `collection/[id].tsx:29` and `store/[id].tsx:124`. Make the rail product card 1:1. This fixes "images not filling their frames".
3. **(M) The `<Photo>` component, with sized URLs, placeholders (main colour, then blurhash), a 150 ms fade, recyclingKey and a memory-plus-disk cache.** Adopt it first on the product cards, store rail, category tiles and discover tiles. Includes `mediaUrl(key, widthPt)` in `src/api.ts` and `mediaBase` in config. Expect roughly 70–90% fewer image bytes on the home screen.
4. **(M) The no-photo system for OSM listings:** 16 bundled illustrations, a monogram chip and department tint variants, plus `<NoPhoto>` as the error fallback everywhere. Without it, discover towns look broken.
5. **(S) Stop the triple download on the product page.** The blurred backdrops at `product/[id].tsx:89,150` request 96 px. Also prefetch the detail hero when a product card is pressed.
6. **(S) Text-on-photo tokens and badge placement.** Add shared `scrim.soft / scrim.bottom / scrim.hero` stops (taken from `immersive-header.tsx:22`). Raise the discount badge from 7 pt to 10 pt and move it top-left. Add ADD overlapping the photo edge, as Swiggy does, and set a 9 pt minimum for any text on imagery.
7. **(M) Replace weak source files.** Re-export the 20 `item-*` cut-outs and 13 `float-*` renders at 800 px or more. Convert the 400–600 KB PNGs to WebP. Use real logos, not photos, in `stores[].logo`. Give discover tiles portrait (5:8) images or a portrait crop point.
8. **(L) One 3D illustration family:** v3 department icons, Swiggy-style tall service tabs, the rider illustration for delivery type, and the 16 no-photo illustrations. This is what makes the app look like one product.

---

## Open questions for the founder
- Are we on (or willing to move to) a Supabase plan with image transformations? If not, we make fixed sizes when publishing (same app code, slightly more storage).
- Should discover listings show a "Request this shop" button (ties into launch requests), and later "Own this shop? Add photos"?
- Who produces the 3D illustration family (image generator plus clean-up, or one illustrator), and is Indian-first subject matter (thali, chai, kirana) the right direction?
