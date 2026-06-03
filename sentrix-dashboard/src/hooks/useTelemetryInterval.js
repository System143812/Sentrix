import { useEffect, useState } from "react";
import * as settingsApi from "../services/settingsApi.js";

const DEFAULT_TELEMETRY_INTERVAL_MS = 5000;

export function clampTelemetryInterval(value, fallback = DEFAULT_TELEMETRY_INTERVAL_MS) {
  return Math.min(Math.max(Number(value) || fallback, 1000), 60000);
}

export function useTelemetryInterval(fallback = DEFAULT_TELEMETRY_INTERVAL_MS) {
  const [intervalMs, setIntervalMs] = useState(() => {
    const cached = settingsApi.getCachedTelemetryInterval();
    return clampTelemetryInterval(cached || fallback);
  });

  useEffect(() => {
    let active = true;

    settingsApi
      .getTelemetrySettings()
      .then((settings) => {
        if (active) {
          setIntervalMs(clampTelemetryInterval(settings?.intervalMs, fallback));
        }
      })
      .catch(() => {
        if (active) {
          setIntervalMs(clampTelemetryInterval(fallback));
        }
      });

    return () => {
      active = false;
    };
  }, [fallback]);

  return intervalMs;
}
