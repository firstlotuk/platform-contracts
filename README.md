# `@firstlot/platform-contracts`

Compile-time boundary package for stable cross-repo contracts.

This package is **not**:

- a deployed service
- middleware
- a shared utility library
- the home for internal domain models

This package **is**:

- the place for stable shapes that cross repo boundaries
- the shared contract layer between `firstlot-suite`, child apps, and other packages that must agree on the same wire/schema shape

## What belongs here

Put a type here only if all of these are true:

1. it crosses a runtime boundary between repos
2. more than one repo must compile against the same shape
3. drift between copies would be harmful
4. the type is stable enough to deserve central ownership

Good examples:

- filing hub ↔ child app context/contracts
- child app status and summary DTOs
- stable fact-summary contracts consumed outside the owning app
- shared lifecycle/status enums used across repo boundaries

## What must stay out

Do **not** put these here unless they become true cross-repo boundary contracts:

- internal section payloads
- app-local persistence shapes
- YAML/rule-pack internals
- interview/session internals
- accountant/task persistence internals
- notification storage internals
- generic helpers, utilities, or mappers

If a repo computes and consumes a shape internally, it stays in that repo.

## Ownership model

- `platform-contracts` owns boundary types
- each app owns its internal richer models
- apps map internal models to platform contracts at the boundary

That mapping layer is healthy. Do not try to erase it.

## Current role in the workspace

Today this package is partially staged but not fully adopted yet.

Known current usage pattern:

- some boundary types are already defined here
- some apps still carry duplicated local copies
- TODO comments in consumer repos point to this package as the eventual source of truth

The right next move is gradual adoption, not a broad migration.

## Adoption rule

Migrate one stable contract family at a time:

1. choose a duplicated cross-repo type set
2. move or confirm it here
3. import it from consumers
4. delete local duplicates

Do not move fluid or app-local types here just to "centralize" them.
