import { defineComponent, Types } from 'bitecs';

export default defineComponent({
  forward: Types.i16,
  backward: Types.i16,
  strafeLeft: Types.i16,
  strafeRight: Types.i16,
});
