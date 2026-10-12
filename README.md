# FORMA Object Lab

FORMA is a responsive product catalogue for a small-batch design workshop. It keeps the original warm-neutral and lime visual identity, with a restored dark theme.

## Storefront features

- Search, category filters, sorting, and a locally saved favourites list.
- Separate, shareable product pages with product metadata.
- Interactive STL preview for included models and a browser-local STL preview for custom projects.
- Russian, German, and English interface.
- A basket that persists in the browser and can export a plain-text request.
- A Supabase-backed portal at `/team.html`: customers submit and follow requests, employees see only assigned orders, managers assign work, and the owner controls account roles.
- Responsive layout, keyboard focus indicators, reduced-motion support, and a custom 404 page.

The catalogue, product pages, theme, favourites, and basket work without an account, API key, or external database. Customer STL files stay on the customer's device. A request download is prepared locally; the page does not claim it was sent to the seller.

## Edit products

Edit `catalog.json`, then build. Product titles/descriptions have `ru`, `en`, and `de` values. `image` points to an image in `images/`; `model` can point to a local STL file.

```sh
npm run build
```

The build uses Node.js 20 or later and generates the `dist/` publish directory. It also creates crawlable pages at `products/<slug>/index.html`. To preview the built site locally:

```sh
npm run dev
```

## Render

`render.yaml` defines a Render Static Site with `npm run build` as its build command and `dist` as its publish directory. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Render service environment; the build generates `dist/config.js` from those variables. For an existing Blueprint, add both variables in the Render Dashboard's Environment tab. See [Render's Static Site guide](https://render.com/docs/static-sites) and [Blueprint YAML reference](https://render.com/docs/blueprint-spec).

## Team portal setup

Run `supabase/schema.sql` in the Supabase SQL Editor. Promote the owner's first account to `creator` using the bootstrap SQL comment at the end of that schema. The Russian setup and order-assignment guide is in [TUTORIAL_ORDERS_RU.md](TUTORIAL_ORDERS_RU.md). The owner can then assign `employee` or `manager` roles from `/team.html`.

The team portal supports customer request submission, owner-managed employee access, manager assignment, and employee status updates. It does not process payment or shipping for requests created in that portal.

## Before accepting real orders

The main storefront basket is still browser-local. The `/team.html` portal stores customer requests and assignments in Supabase, but does not collect shipping addresses or process payments and labels. Configure and secure the approved payment and shipping providers before promising checkout or fulfilment. Add the real business identity, contact details, privacy notice, shipping terms, and returns policy before publishing to customers.

