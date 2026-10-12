# FORMA Object Lab

FORMA is a responsive product catalogue for a small-batch design workshop. It keeps the original warm-neutral and lime visual identity, with a restored dark theme.

## Storefront features

- Search, category filters, sorting, and a locally saved favourites list.
- Separate, shareable product pages with product metadata.
- Interactive STL preview for included models and a browser-local STL preview for custom projects.
- Russian, German, and English interface.
- A basket that persists in the browser and can export a plain-text request.
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

`render.yaml` defines a Render Static Site with `npm run build` as its build command and `dist` as its publish directory. The included response headers add basic browser security protections. Connect the GitHub repository in Render and create the Static Site from its Blueprint; future pushes to the selected branch can trigger automatic deployments. See [Render's Static Site guide](https://render.com/docs/static-sites) and [Blueprint YAML reference](https://render.com/docs/blueprint-spec).

## Before accepting real orders

This is a polished catalogue and local basket, not a complete transactional marketplace. It does not provide shared accounts or roles, server-side order records, payment processing, live Shippo rates, shipping labels, or a staffed support inbox. The earlier backend stubs are deliberately outside the Render static build. Connect and secure a backend and approved providers before advertising checkout, collecting customer addresses, or promising fulfilment. Add the real business identity, contact details, privacy notice, shipping terms, and returns policy before publishing to customers.
