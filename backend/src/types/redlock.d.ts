declare module "redlock" {
  import { Redis } from "ioredis";

  export interface Settings {
    retryCount?: number;
    retryDelay?: number;
    retryJitter?: number;
    automaticExtensionThreshold?: number;
    driftFactor?: number;
  }

  export class Lock {
    readonly resources: string[];
    readonly value: string;
    readonly expiration: number;
    release(): Promise<void>;
    extend(duration: number): Promise<Lock>;
  }

  class Redlock {
    constructor(clients: Redis[], settings?: Settings);
    acquire(resources: string[], duration: number): Promise<Lock>;
    release(lock: Lock): Promise<void>;
    extend(lock: Lock, duration: number): Promise<Lock>;
    on(event: "error", handler: (err: Error) => void): this;
    quit(): Promise<void>;
  }

  export default Redlock;
}
