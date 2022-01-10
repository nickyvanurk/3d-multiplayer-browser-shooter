import { defineComponent, Types } from 'bitecs';

export default defineComponent({
  forward: Types.ui8,
  backward: Types.ui8,
  strafeLeft: Types.ui8,
  strafeRight: Types.ui8,
});
