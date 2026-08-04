export interface LatestRequestHandle {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
}

/** Coordinates latest-request-wins lanes without depending on React. */
export class LatestRequestCoordinator {
  private readonly generations = new Map<string, number>();
  private readonly controllers = new Map<string, AbortController>();

  start(lane: string): LatestRequestHandle {
    this.controllers.get(lane)?.abort();
    const controller = new AbortController();
    const generation = (this.generations.get(lane) || 0) + 1;
    this.generations.set(lane, generation);
    this.controllers.set(lane, controller);

    const isCurrent = () =>
      !controller.signal.aborted
      && this.generations.get(lane) === generation
      && this.controllers.get(lane) === controller;
    const finish = () => {
      if (isCurrent()) this.controllers.delete(lane);
    };
    return { signal: controller.signal, isCurrent, finish };
  }

  cancel(lane: string): void {
    this.controllers.get(lane)?.abort();
    this.controllers.delete(lane);
    this.generations.set(lane, (this.generations.get(lane) || 0) + 1);
  }

  cancelMany(lanes: string[]): void {
    for (const lane of lanes) this.cancel(lane);
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}

export function isAbortedRequest(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
