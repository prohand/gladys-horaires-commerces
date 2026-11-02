# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release workflow
moves that section under the version it ships, and the section becomes the notes of
the version's GitHub Release.

## [Unreleased]

### Added

- Shop hours widget: new setting "Next days shown" (0 to 6). A shop in detail also
  shows the hours of the following days, public holidays marked; 6 shows the whole
  week.

## [1.0.1] - 2026-10-30

### Added

- The OpenStreetMap lookups go through overpass.ch only, with your own free key
  (new "overpass.ch key" setting: the key alone or its whole URL). No key: nothing
  is looked up, the shops and **Test the configuration** say so.
- Opening hours of several shops in the OpenStreetMap syntax, with French public
  holidays: one device per shop (open, minutes until it opens or closes).
- Opening hours found automatically: a shop written with no hours (`Name`, or
  `Name = auto: words`) takes the hours of the nearest matching shop on
  OpenStreetMap, around the Gladys houses (new "Search radius" setting, location
  access of the houses). Looked up once a day, kept in `/data/hours.json`.
- Shops around the houses in the Discovery tab: the 3 nearest shops of each kind
  checked (supermarkets, bakeries, pharmacies, post offices, recycling centres…) that
  publish their hours on OpenStreetMap, listed per Gladys house with their distance.
  A shop created from there works like a typed one, its hours kept up to date. New
  settings: the houses to search around, the kinds of shops to offer. **Test the
  configuration** looks again and says what the Discovery tab offers, or why nothing.
- Scene triggers: a shop opens soon, a shop closes soon (filter: the shop).
- Scene action: is a shop open.
- Dashboard widget: shop hours (all shops, or one in detail).
- Configuration-screen action: test the configuration.
- English, French, German and Spanish for every text and the documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  multi-arch image build, Release and GitHub releases workflows, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-horaires-commerces/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-horaires-commerces/releases/tag/v1.0.1
