import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { drivingRoute, type Route } from "../../modules/directions/src";

type Point = { latitude: number; longitude: number };

// Turn-by-turn guidance on Apple's directions. In MapKit each step's
// instruction ("Turn right onto Elgin St") describes the turn at the START of
// that step, so while driving step k the next turn is steps[k + 1]'s, at the
// end of step k. Speaks the next turn early (when there's room) and again just
// before it; finds a new route when the driver leaves this one.
const ARRIVED_M = 35;
const STEP_DONE_M = 20;
const OFF_ROUTE_M = 50;
const SAY_SOON_M = 150;

const rad = (d: number) => (d * Math.PI) / 180;
export function metersBetween(a: Point, b: Point) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Compass direction from a to b, in degrees (0 = north).
function bearing(a: Point, b: Point) {
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Shortest distance from p to the route line (flat-earth math, fine at city scale).
function metersFromLine(p: Point, line: Point[]) {
  const k = Math.cos(rad(p.latitude)) * 111_320;
  const xy = (q: Point) => [(q.longitude - p.longitude) * k, (q.latitude - p.latitude) * 110_540];
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = xy(line[i - 1]);
    const [bx, by] = xy(line[i]);
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// Distances the way people say them: "200 m", "1.4 km"; spoken "200 metres".
export const shortDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const spokenDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} kilometres` : `${Math.max(50, Math.round(m / 50) * 50)} metres`;

export type Guidance = {
  route: Route | null;
  position: Location.LocationObject | null;
  nextInstruction: string; // the next turn, e.g. "Turn right onto Elgin St"
  metersToTurn: number;
  metersLeft: number;
  secondsLeft: number;
  heading: number | null; // which way the map should face: travel direction
  arrivalMessage: string;

  arrived: boolean;
  rerouting: boolean;
};

// `arrival` is what to say and show on arriving: what to do next there
// (e.g. "Leave the order at the door and take a photo").
export function useNavigation(destination: Point | null, destinationName: string, voice: boolean, arrival?: string) {
  const [route, setRoute] = useState<Route | null>(null);
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [step, setStep] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const announced = useRef(new Set<string>());
  const offRoute = useRef(0);
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  // Latest values for the location callback.
  const routeRef = useRef<Route | null>(null);
  const stepRef = useRef(0);
  const arrivedRef = useRef(false);
  const reroutingRef = useRef(false);

  const say = (key: string, text: string) => {
    if (announced.current.has(key)) return;
    announced.current.add(key);
    if (voiceRef.current && text) Speech.speak(text, { language: "en-CA", rate: 1.0 });
  };

  const plan = async (from: Point) => {
    if (!destination) return;
    reroutingRef.current = true;
    setRerouting(true);
    const found = await drivingRoute(from, destination);
    reroutingRef.current = false;
    setRerouting(false);
    if (!found) return;
    announced.current.clear();
    offRoute.current = 0;
    stepRef.current = 0;
    setStep(0);
    routeRef.current = found;
    setRoute(found);
  };

  // Each new position: advance through the steps, speak, check arrival and
  // whether the driver has left the route.
  const follow = (here: Point) => {
    const current = routeRef.current;
    if (!current || !destination || arrivedRef.current) return;

    if (metersBetween(here, destination) <= ARRIVED_M) {
      arrivedRef.current = true;
      setArrived(true);
      say("arrived", arrival ?? `You've arrived at ${destinationName}.`);
      return;
    }

    let k = stepRef.current;
    while (k < current.steps.length - 1 && metersBetween(here, current.steps[k].end) <= STEP_DONE_M) k++;
    if (k !== stepRef.current) {
      stepRef.current = k;
      setStep(k);
    }

    const next = current.steps[k + 1];
    const toTurn = metersBetween(here, current.steps[k].end);
    if (next?.instructions) {
      if (toTurn > SAY_SOON_M * 2) say(`early-${k}`, `In ${spokenDistance(toTurn)}, ${next.instructions}`);
      if (toTurn <= SAY_SOON_M) say(`now-${k}`, next.instructions);
    }

    if (metersFromLine(here, current.coordinates) > OFF_ROUTE_M) {
      offRoute.current += 1;
      if (offRoute.current >= 3 && !reroutingRef.current) {
        say(`reroute-${Date.now()}`, "Finding a new route.");
        plan(here);
      }
    } else {
      offRoute.current = 0;
    }
  };

  // Follow the driver; plan the route from the first fix.
  useEffect(() => {
    if (!destination) return;
    let sub: Location.LocationSubscription | null = null;
    let planned = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3 },
        (pos) => {
          setPosition(pos);
          if (!planned) {
            planned = true;
            plan(pos.coords);
          } else {
            follow(pos.coords);
          }
        },
      );
    })();
    return () => {
      sub?.remove();
      Speech.stop();
    };
  }, [destination?.latitude, destination?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = position?.coords;
  const current = route?.steps[step];
  const next = route?.steps[step + 1];
  const metersToTurn = here && current ? metersBetween(here, current.end) : 0;
  const metersLeft = route
    ? metersToTurn + route.steps.slice(step + 1).reduce((sum, s) => sum + s.meters, 0)
    : 0;
  const secondsLeft = route && route.meters > 0 ? (route.seconds * metersLeft) / route.meters : 0;

  // Which way to face: the phone's course while moving, otherwise towards the
  // next turn (the GPS has no course when standing still).
  const course = position?.coords.heading;
  const heading = course != null && course >= 0 && (position?.coords.speed ?? 0) > 1
    ? course
    : here && current ? bearing(here, current.end) : null;

  const guidance: Guidance = {
    route,
    position,
    heading,
    nextInstruction: arrived ? `You've arrived at ${destinationName}` : next?.instructions || "Continue on the route",
    arrivalMessage: arrival ?? `You've arrived at ${destinationName}.`,
    metersToTurn,
    metersLeft,
    secondsLeft,
    arrived,
    rerouting,
  };
  return guidance;
}
