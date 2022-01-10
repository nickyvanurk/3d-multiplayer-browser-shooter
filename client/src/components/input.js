import { defineComponent, Types } from 'bitecs';

export default defineComponent({
  forward: Types.i8,
  backward: Types.i8,
  strafeLeft: Types.i8,
  strafeRight: Types.i8,
  mouseDelta: [Types.f32, Types.f32],
});
