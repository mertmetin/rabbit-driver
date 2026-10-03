import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

export type Step = { instructions: string; meters: number; end: { latitude: number; longitude: number } };
export type Route = { seconds: number; meters: number; coordinates: { latitude: number; longitude: number }[]; steps: Step[] };
type Point = { latitude: number; longitude: number };

// Apple Maps driving directions (iOS). Missing in Expo Go and on other
// platforms, where there's simply no route line.
const native = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ drivingRoute(a: number, b: number, c: number, d: number): Promise<Route> }>("Directions")
  : null;

export async function drivingRoute(from: Point, to: Point): Promise<Route | null> {
  if (!native) return null;
  try {
    return await native.drivingRoute(from.latitude, from.longitude, to.latitude, to.longitude);
  } catch {
    return null;
  }
}
