# Remote Entity Visual Smoothing (Fiedler Error Reduction)

Date: 2026-07-11

## Problem

Remote entities don't move smoothly. Voidfall uses Glenn Fiedler's state-
synchronization model (deterministic Rapier physics on both server and client;
the client's remote bodies are snapped to the authoritative server state each
snapshot and coast on velocity between snapshots). On every `WORLD` snapshot the
client **hard-snaps** the remote body to the corrected/extrapolated pose, and
the renderer shows that jump over a single fixed step via the `prev→current`
lerp. The result is the classic "hops, warps, wobbles" — the correction pops.

The existing `prev→current` render lerp only smooths motion *between fixed
steps*; it does nothing to hide *corrections*. That is the missing layer.

## Approach — render-layer error offset (Fiedler)

Reference: Glenn Fiedler, "State Synchronization" (gafferongames.com). Keep the
physics exactly as it is — snap the body hard (smoothing the simulation itself
would create invalid physics and break extrapolation). Do all smoothing at the
**render layer** via a per-entity error offset that absorbs each correction and
decays to zero over time, so the mesh glides from where it was to the true state
instead of popping.

Deliberately NOT projective velocity blending (PVB): PVB is for architectures
that dead-reckon remote actors analytically with no physics. Voidfall runs
physics on both sides, so Fiedler's error reduction is the correct tool and is
purely additive (no physics change, no collision loss, no solver fight).

## Design

### 1. Per-entity render error

Each remote entity carries a render error on its `Transform`, alongside the
existing `prevPosition`/`prevRotation` render state:

- `errorPosition: Vector3` (default `0,0,0`)
- `errorRotation: Quaternion` (default identity)

Client-render-only; the server never reads or writes them.

### 2. Capture on correction (`NetworkClient.applyWorldState`)

At each correction, BEFORE the body is snapped, convert the pop into an offset:

```
// where the mesh visually is right now
visualPos = transform.position + errorPosition
visualRot = transform.rotation * errorRotation

// ... compute newPos/newRot (the snapped + age-extrapolated pose, as today) ...

// absorb the discontinuity into the error so the mesh does not move this frame
errorPosition = visualPos − newPos
errorRotation = inverse(newRot) * visualRot     // so newRot * errorRotation == visualRot

// then snap the body + set transform.position/rotation = newPos/newRot (unchanged)
```

Using the raw `transform.position` (not the interpolated render pose) for the
capture is Fiedler's own approximation; the ≤1-sub-step discrepancy folds into
the decaying error.

**Teleport guard:** if `|errorPosition|` exceeds `TELEPORT_THRESHOLD` (e.g. a
respawn across the map), zero the error (and reset rotation error to identity) so
the ship snaps instead of smearing across the screen for 20 frames.

### 3. Render + decay (`ViewRegistry.update`)

The only place that draws. Render the mesh at the interpolated body pose plus the
offset, then decay the offset toward zero:

```
mesh.position = lerp(prevPosition, position, alpha) + errorPosition
mesh.quaternion = slerp(prevRotation, rotation, alpha) * errorRotation

decayError(transform, dt)   // shrink errorPosition / errorRotation toward 0 / identity
```

This composes with the existing `prev→current` lerp by simple addition; the lerp
is untouched.

**Adaptive, framerate-independent decay.** Fiedler blends the smoothing factor by
error magnitude: small error → slow factor (~0.95, invisible); large error →
fast factor (~0.85, snappy recovery); linear blend between a small and large
distance threshold. His constant is per-60fps-frame; since rAF runs at a variable
rate, apply it framerate-independently:

```
factor = blend(SMALL_FACTOR, LARGE_FACTOR, |errorPosition|, SMALL_DIST, LARGE_DIST)
errorPosition *= factor ** (dt / 16.667)          // 16.667ms = one 60Hz frame
```

Orientation decays by slerping `errorRotation` toward identity by an adaptive
amount (`~0.05–0.15`), blended off `dot(errorRotation, identity)`, likewise
framerate-scaled.

**Tunable constants.** `SMALL_FACTOR`, `LARGE_FACTOR`, `SMALL_DIST`, `LARGE_DIST`
(and the rotation blend amounts) are derived from ship size + typical speed and
exposed as **F3 debug sliders**, so they can be dialed in live in-game.

### 4. Scope

Remote ships + the vendor (both corrected in `applyWorldState`). **Skip bullets**
— short-lived and fast; a decaying offset would visibly bend their straight
tracer path. Static asteroids never move, so they never accumulate error.

## Testing

Pure helpers so the logic is unit-testable without a renderer (`test/sim/`):

- `captureError(transform, newPos, newRot)` — **continuity property**: after
  capture, `newPos + errorPosition == pre-correction visualPos` (within eps), and
  `newRot * errorRotation == pre-correction visualRot`. Identity/zero cases.
- Teleport guard: an error beyond `TELEPORT_THRESHOLD` is zeroed.
- `decayError(transform, dt)` — monotonic decrease toward zero; a large error uses
  the faster factor than a small one; **framerate independence**: one 33.3ms step
  ≈ two 16.67ms steps in total decay (within eps).
- Rotation decay reaches identity within tolerance; identity in → identity out.

The `ViewRegistry` / `applyWorldState` wiring is verified by typecheck plus live
in-app tuning (the constants ship as F3 sliders).

## Not doing (YAGNI)

- No PVB / analytical dead reckoning (wrong tool for a physics-both-sides model).
- No jitter buffer yet — add later only if uneven packet arrival is still visible
  after error smoothing.
- No change to the physics, the hard snap, or the age-based extrapolation.
- No smoothing on bullets or static geometry.

## Rollout

TDD each piece: pure error-math helpers first (capture, decay, teleport guard),
then the `Transform` fields, then the `applyWorldState` capture wiring, then the
`ViewRegistry` render+decay + F3 sliders. Verify via `test/sim` + typecheck; final
visual tuning is user-driven in the running app (no dev servers started by the
agent).
