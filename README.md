# Car Seller Service

Standalone Nuxt calculator for sourcing a car in Germany, moving it into Spain, and registering it on Spanish plates.

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`

## Scope

- Germany to Spain intra-EU used-car import workflow.
- Transparent formulas for VAT treatment, transport, IEDMT, and registration costs.
- Editable line-item overrides for real-world quotes and edge cases.

## Render Deployment

This app is prepared for Render.

Option 1: Blueprint

- Create a new Blueprint service in Render.
- Point Render at this repository.
- Render will use `render.yaml` from the repository root.

Option 2: Manual Web Service

- Root directory: leave empty
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Runtime: Node

Recommended environment values:

- `NODE_VERSION=22.14.0`
- `HOST=0.0.0.0`

Render provides `PORT` automatically, which Nitro uses in production.

## Deployment Checks

- `npm run test:deploy` validates the local Render config and required root files.
- `npm run test:smoke` starts the built Nitro server and verifies the main UI is present in production HTML.
- `npm test` runs deployment checks, typecheck, production build, and the Render smoke test.

## Research Baseline

- DGT ordinary registration flow and fee.
- Your Europe VAT and registration guidance for EU vehicle purchases.
- Spanish IEDMT bands and common import cost assumptions.

Always verify current rates with your gestor, town hall, ITV station, and Agencia Tributaria before buying stock.
