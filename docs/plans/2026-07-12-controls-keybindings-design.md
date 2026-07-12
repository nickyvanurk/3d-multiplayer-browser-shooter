# Controls & Keybindings — Design

Date: 2026-07-12

## Goal

Let the player view and rebind keyboard/mouse controls from the in-game
Settings overlay (Escape). Bindings persist alongside the other settings.

There is no standalone main menu in Voidfall — the game boots straight into
play, and the closest thing to a "menu" is the Escape → Settings overlay
(`client/src/ui/settings-menu.ts`). The Controls UI lives there as a second
view within the same panel.

## Decisions

- **Location:** a "Controls…" button in the Settings overlay switches the panel
  to a Controls view (no separate startup menu).
- **Scope:** all user-facing keys are rebindable — movement, fire (mouse
  buttons), camera free-look, shop toggle, and the music-player keys. Debug-panel
  keys (F3, digits, R) are excluded (dev-only). Escape stays fixed as the
  menu/cancel key and shows as a disabled row.
- **Conflicts:** *warn + unbind other* — binding a key already used by another
  action clears that other action's binding and shows a transient warning; the
  cleared action renders as `— unbound —` until rebound.
- **Capture types:** fire actions capture mouse buttons; every other action
  captures keys. Matches the existing data model (buttons are indices, keys are
  `KeyboardEvent.code`).

## Data model

`client/src/input/keybindings.ts` extends `Keybindings`. Keyboard actions are
`string | null` (`code`); mouse actions are `number | null` (button index).
`null` = deliberately unbound.

New actions added to the existing movement + `weaponPrimary/Secondary`:
`cameraOrbit` (AltLeft), `shopToggle` (KeyF), `musicPrev/Next/VolUp/VolDown/
PlayPause/PanelToggle` (Arrow keys, KeyP, KeyM).

A declarative `KEYBINDING_LAYOUT: KeybindingDescriptor[]` (action, label, group,
kind) drives the Controls UI so rows are data, not hand-built.

## Persistence

`client/src/settings.ts` adds `keybindings: Keybindings` to `GameSettings`,
defaulting to `DEFAULT_KEYBINDINGS`. `load()` merges saved bindings over the
defaults (new actions get defaults; persisted `null` stays unbound).

The store holds one live `keybindings` object shared with `InputController` and
the HUDs, so a rebind takes effect immediately — no re-attach. `rebind(action,
value)` applies the change in place and saves; `resetKeybindings()` restores
defaults. Both mutate the shared object so existing references stay valid.

## Conflict logic (pure, unit-tested)

`client/src/input/rebind.ts` exports `applyBinding(bindings, action, value)`,
returning a new bindings object plus the list of actions that were unbound. It
assigns `value` to `action` and clears any *other* action holding the same value
(same value-space, so keys and buttons never collide). Rebinding an action to
its own current key is a no-op. Pure and DOM-free — tested in
`test/sim/rebind.test.ts`.

## UI (settings-menu.ts)

The panel gains two views:

- **Main:** existing FOV/stiffness sliders + a "Controls…" button.
- **Controls:** grouped rebind rows (Movement / Combat / Camera / Interface /
  Music), a disabled "Menu / Cancel · Esc" row, a warning line, and
  "Reset to defaults" + "Back" buttons.

Each rebind row shows a friendly label for the current binding (`W`,
`Left Mouse`, `←`). Clicking a row enters capture ("press a key…" / "click a
button…"). A **capture-phase** document listener grabs the next key (or mouse
button for fire rows) with `stopImmediatePropagation` + `preventDefault`, so the
keypress can't also trigger the shop/music hotkeys or the ship. **Escape cancels**
capture. On success, `settings.rebind()` applies + persists, all rows re-render,
and any unbound action is called out in the warning line.

## Wiring changes

- `game.ts`: pass `settings.keybindings` into `InputController`, `ShopHud`, and
  `MusicPlayerHud`.
- `input-controller.ts`: camera free-look checks `keybindings.cameraOrbit`
  instead of `AltLeft/AltRight`.
- `shop-hud.ts`: shop toggle checks `keybindings.shopToggle`.
- `music-player-hud.ts`: the six hotkeys check `keybindings.music*`.

## Testing

- Unit (`test/sim/rebind.test.ts`, run via `npm run test:sim`): `applyBinding`
  assign / no-op-on-self / warn+unbind-other / value-space isolation, and the
  `mergeKeybindings` load-merge helper.
- Manual: Settings → Controls, rebind a movement key and a fire button, confirm
  live effect, persistence across reload, and that the freed key unbinds the old
  action.
