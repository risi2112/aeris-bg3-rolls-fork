## v14.0.11

### Fixed

-   The chat card's modifier now includes every bonus in the roll (e.g. a Paladin's Aura of
    Protection). It only summed plain-number terms, so the total was right but the "+N" shown
    next to the die was too low.

## v14.0.10

### Fixed

-   Dice no longer vanish when the result is revealed (the reveal animation set the die's scale to
    absolute values, which shrank the resized Dice So Nice 6 dice to nothing)
-   Smaller dice
-   If the die face can't be relabelled with the total, the total appears above the portrait

## v14.0.9

### Fixed

-   Dice sit where the layout intends (above each portrait) on Dice So Nice 6: the layout works in
    half-pixel units, not pixels

## v14.0.8

### Fixed

-   3D dice on Dice So Nice 6: it switched to a metric scene with a top-down camera, so dice placed
    in screen pixels ended up far outside the view. Dice now sit in a group that maps the module's
    pixel layout onto the plane under Dice So Nice's camera, and are sized in screen pixels.

## v14.0.7

### Added

-   `aerisBg3Rolls.diagnoseDice()`: shows a test die for a few seconds and whispers a report about
    the Dice So Nice dice box to the GM, for troubleshooting invisible dice

## v14.0.6

### Fixed

-   3D dice: newer Dice So Nice dice boxes have no `diceList` (and may lack `renderScene` /
    `setScene`), which stopped every die right after it was created

## v14.0.5

### Fixed

-   3D dice: when Dice So Nice exposes no appearance helper at all, use the player's saved Dice So
    Nice appearance (or a plain die in the player's colour) instead of giving up

## v14.0.4

### Fixed

-   3D dice on newer Dice So Nice versions: `Dice3D.ALL_CUSTOMIZATION` no longer exists, so the
    player's dice appearance is now read through fallbacks (`APPEARANCE`, user flags + defaults)
-   A die is no longer dropped when the "modified total" face can't be prepared

## v14.0.3

### Fixed

-   Group Roll Manager list scrolls inside the window; the + button sits below the list
-   Portraits show a pointer cursor and a "Click to roll" tooltip while they're waiting to be rolled

### Changed

-   If the 3D dice can't be created, the GM gets an on-screen warning with the reason

## v14.0.2

### Added

-   **Roll again** button on finished rolls, which re-runs the same roll with the same players
-   **Roll automatically** world setting: roll everyone's die as soon as the overlay appears
    instead of waiting for each portrait to be clicked

### Changed

-   Finished rolls stay in the Group Roll Manager instead of disappearing
-   Shorter pauses: the total is revealed as soon as the die lands, and the overlay closes sooner

### Fixed

-   3D dice: wait for Dice So Nice to finish loading before creating the dice box
-   Buttons and the roll type picker in the Manager and editor are styled on V14 (Tailwind
    utilities are no longer in a cascade layer, which Foundry's own styles always beat)

## v14.0.1

### Fixed

-   Group Roll Manager and editor windows are styled again (text fields, roll type picker). They
    relied on Aeris Core adding the Tailwind `.tw` scope to the window, which no longer happens on V14.

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
