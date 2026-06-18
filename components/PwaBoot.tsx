"use client";

import { useEffect } from "react";

export function PwaBoot() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/service-worker.js").catch(() => {
      return;
    });
  }, []);

  return null;
}
