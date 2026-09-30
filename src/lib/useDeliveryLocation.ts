import { useEffect } from "react";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api } from "./api";

export const LOCATION_TASK = "rabbit-delivery-location";

// Runs even when the app is in the background or the phone is locked (in a
// real app build). Defined at module load, as TaskManager requires.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const { latitude, longitude } = data.locations[data.locations.length - 1].coords;
  await api("driver/location", { body: { latitude, longitude } }).catch(() => {});
});

// Expo Go can't track in the background; there we track while the app is open.
const inExpoGo = Constants.executionEnvironment === "storeClient";

async function startBackground() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return false;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 30,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true, // blue pill on iOS while sharing
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Rabbit Driver",
      notificationBody: "Sharing your location with the customer during this delivery.",
      notificationColor: "#00754a",
    },
  });
  return true;
}

async function stopBackground() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

// While the driver is carrying an order, send their position (every ~10 s or
// 30 m) so the customer can follow along. Stops as soon as nothing is on the way.
export function useDeliveryLocation(active: boolean) {
  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      if (!active) {
        if (!inExpoGo) await stopBackground().catch(() => {});
        return;
      }
      if (!inExpoGo && (await startBackground().catch(() => false))) return;

      // Fallback: foreground only (Expo Go, or background permission refused).
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30 },
        (pos) => { api("driver/location", { body: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }).catch(() => {}); },
      );
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
    };
  }, [active]);
}
