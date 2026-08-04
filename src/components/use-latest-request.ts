"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LatestRequestCoordinator } from "@/core/async/latest-request";

export { isAbortedRequest } from "@/core/async/latest-request";

/**
 * Gives each async UI lane latest-request-wins semantics.
 * Starting or cancelling a lane aborts its old request and invalidates every
 * completion callback captured by that request.
 */
export function useLatestRequests() {
  const [coordinator] = useState(() => new LatestRequestCoordinator());

  const cancel = useCallback((lane: string) => {
    coordinator.cancel(lane);
  }, [coordinator]);

  const cancelMany = useCallback((lanes: string[]) => {
    for (const lane of lanes) cancel(lane);
  }, [cancel]);

  const start = useCallback((lane: string) => coordinator.start(lane), [coordinator]);

  useEffect(() => () => coordinator.cancelAll(), [coordinator]);

  return useMemo(() => ({ start, cancel, cancelMany }), [cancel, cancelMany, start]);
}
