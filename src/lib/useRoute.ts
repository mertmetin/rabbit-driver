import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { drivingRoute, type Route } from "../../modules/directions/src";
import type { DriverOrder } from "./api";

type Point = { latitude: number; longitude: number };

// The drive for this order, for the map: from where the driver is now to the
// store while shopping, and to the customer once it's shopped or on its way.
// Rechecked every minute while the screen is open (traffic, the driver moving).
export function useRoute(order: DriverOrder | null, mine: boolean) {
  const [route, setRoute] = useState<(Route & { to: "store" | "customer" }) | null>(null);
  const status = order?.status;
  const toCustomer = status === "ready" || status === "out_for_delivery";
  const destination: Point | null = !order
    ? null
    : toCustomer
      ? order.address.latitude !== null && order.address.longitude !== null
        ? { latitude: order.address.latitude, longitude: order.address.longitude }
        : null
      : { latitude: order.store.latitude, longitude: order.store.longitude };
  const key = destination ? `${destination.latitude},${destination.longitude}` : "";

  const active = mine && !!destination && status !== "delivered" && status !== "cancelled";

  useEffect(() => {
    if (!active || !destination) return;
    let cancelled = false;
    const update = async () => {
      const here = (await Location.getLastKnownPositionAsync().catch(() => null))
        ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      // Without a position (e.g. permission refused), show the store-to-customer drive.
      const from = here?.coords ?? (toCustomer && order ? { latitude: order.store.latitude, longitude: order.store.longitude } : null);
      if (!from) return;
      const found = await drivingRoute(from, destination);
      if (!cancelled) setRoute(found ? { ...found, to: toCustomer ? "customer" : "store" } : null);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active, key, status]); // eslint-disable-line react-hooks/exhaustive-deps

  return active ? route : null;
}
