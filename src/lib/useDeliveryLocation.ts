import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { api } from "./api";

// While the driver is carrying an order, send their position to the server
// (every ~10 seconds or 30 m) so the customer can follow it. Stops otherwise.
// For now this runs while the app is open; tracking with the phone locked
// needs a proper app build (background location).
export function useDeliveryLocation(active: boolean) {
  const sub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!active) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      sub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30 },
        (pos) => {
          api("driver/location", { body: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }).catch(() => {});
        },
      );
    })();

    return () => {
      cancelled = true;
      sub.current?.remove();
      sub.current = null;
    };
  }, [active]);
}
