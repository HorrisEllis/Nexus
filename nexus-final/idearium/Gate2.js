/**
 * Gate — recognizes one event type, transforms it.
 * Source: SISO Core v1.0.0
 */
export class Gate {
  constructor(signature) {
    this.signature = signature;
  }
  transform(event, stream) {}
}
