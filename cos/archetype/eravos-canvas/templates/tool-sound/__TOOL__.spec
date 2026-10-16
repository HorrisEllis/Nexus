# spec_id: __ID__ · version 0.1.0 · status building · template eravos.tool/1
identity:
  id: __ID__ ; label: __LABEL__ ; domain: __DOMAIN__ ; category: __CATEGORY__
  purpose: <one sentence — what someone can do with it>
ports:
  in:  [__TOOL__.hook.in  (event __TOOL__:input)]
  out: [__TOOL__.hook.out (event __TOOL__:value {value})]
params:
  amount: number 0..1 def 0.5
  mode: enum [a, b] def a
behaviour:
  - emits __TOOL__:value whenever amount or mode changes, or on poke
needs: units [] · tools [] · permissions [bus_publish, bus_subscribe]
packs: accepts [presets] · ships [factory]
acceptance (each must pass before status → built):
  - setting amount emits exactly one __TOOL__:value with that value
  - standard: unmount leaves zero subscribers/ports/wires; params clamp; every shipped pack preset loads
