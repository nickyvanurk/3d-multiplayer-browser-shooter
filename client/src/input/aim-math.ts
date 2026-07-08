// Pure screen -> coordinate conversions for aiming. No DOM/three deps so the sim
// harness can unit-test them.

export interface Vec2 {
  x: number;
  y: number;
}

// Ship steering deflection: normalized to the smaller viewport dimension and
// clamped to [-1, 1], so horizontal/vertical mouse sensitivity match in pixels
// and turn rate saturates near the edges. This drives yaw/pitch — it is NOT a
// valid raycaster coordinate (it skews by aspect and clamps).
export function screenToSteering(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): Vec2 {
  const size = height < width ? height : width;
  const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
  return {
    x: clamp((clientX / size) * 2 - width / size),
    y: clamp(-(clientY / size) * 2 + height / size),
  };
}

// True normalized device coordinates: each axis spans its own dimension, y up.
// This is what Raycaster.setFromCamera expects. Feeding the steering value here
// (the old bug) skews the aim ray horizontally by the aspect ratio and saturates
// it at the screen edge past ~1/aspect of the way out, so bullets miss the
// crosshair.
export function screenToNdc(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): Vec2 {
  return {
    x: (clientX / width) * 2 - 1,
    y: -(clientY / height) * 2 + 1,
  };
}
