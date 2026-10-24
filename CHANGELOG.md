## v14.0.0

risi2112 fork for Foundry V14 / dnd5e 6 (work in progress).

### Fixed

-   Load the overlay stylesheet through module.json instead of relying on Aeris Core's CSS hook
-   Still show the overlay if Dice So Nice's dice box can't be created

### Changed

-   Manifest and downloads now come from https://github.com/risi2112/aeris-bg3-rolls-fork

## v13.0.10

### Fixed

-   Corrected download link

## v13.0.9

### Added

-   Shadowdark support

## v13.0.8

-   Fixed tw utilities scoping to under `.tw` only

## v13.0.7

### Fixed

-   Fixed nat 20s to auto succeed

## v13.0.6

### Changed

-   Replaced `crypto.randomUUID` to `foundry.utils.randomID`

## v13.0.5

### Changed

-   Dropped the `tw:` prefix

### Added

-   Flat Checks `(d20)` for PF2e

## v13.0.4

### Fixed

-   Added `color-picker` to dependencies

## v13.0.3

### Added

-   Roll overlay color setting

### Fixed

-   `pf2e` added to `module.json`

## v13.0.2

### Added

-   PF2E integration

## v13.0.1

### Added

-   Integration with **Dice So Nice**: all rolls now use physical dice animations.
-   New **Group Roll Manager** (`aerisBg3Rolls.openGroupRollManager`) – group rolls can be initiated purely by the GM.
-   Integration with **Aeris Core** for cleaner UI components and custom chat messages for group rolls.

### Changed

-   Only supports the **DnD5e** for now. It takes around 100-200 lines of code to integrate a system.
