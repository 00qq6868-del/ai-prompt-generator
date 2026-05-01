"use client";

import { useEffect } from "react";
import { reportWebVitals, initAnalytics } from "@/lib/analytics";

export function WebVitals() {
  useEffect(() => {
    initAnalytics();

    import("web-vitals").then(({ onLCP, onCLS, onTTFB, onINP }) => {
      onLCP(reportWebVitals);
      onCLS(reportWebVitals);
      onTTFB(reportWebVitals);
      onINP(reportWebVitals);
    }).catch(() => {});
  }, []);

  return null;
}
