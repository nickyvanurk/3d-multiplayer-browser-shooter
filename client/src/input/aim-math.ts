// Pure screen -> coordinate conversions for aiming. No DOM/three deps so the sim
// harness can unit-test them.

export interface Vec2 {
  x: number;
  y: number;
}

// Radius of the circular dead zone at screen center, in steering units (the
// smaller viewport half-dimension = 1). Inside it the ship holds heading; past
// it, turn rate ramps from 0 so there is no jump at the boundary.
export const STEERING_DEADZONE = 0.12;

// Ship steering deflection: normalized to the smaller viewport dimension and
// clamped per-axis to [-1, 1], so horizontal/vertical mouse sensitivity match
// in pixels and turn rate saturates near the edges. A circular dead zone at
// center holds the ship steady for small cursor offsets. This drives yaw/pitch
// — it is NOT a valid raycaster coordinate (it skews by aspect and clamps).
export function screenToSteering(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): Vec2 {
  const size = height < width ? height : width;
  const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
  const rawX = (clientX / size) * 2 - width / size;
  const rawY = -(clientY / size) * 2 + height / size;

  // Circular dead zone: measure radial distance from center and, once outside
  // it, rescale the remainder so deflection ramps from 0 at the dead-zone edge
  // (no jump at the boundary). Both components share the same factor, so the
  // deflection direction matches the cursor direction. The per-axis clamp is
  // kept unchanged so a corner cursor still commands full yaw and pitch at once.
  const mag = Math.hypot(rawX, rawY);
  if (mag <= STEERING_DEADZONE) {
    return { x: 0, y: 0 };
  }
  const factor = (mag - STEERING_DEADZONE) / (1 - STEERING_DEADZONE) / mag;
  return {
    x: clamp(rawX * factor),
    y: clamp(rawY * factor),
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
