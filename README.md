# Rabbit Driver

**The app Rabbit's shopper-drivers use to fill and deliver grocery orders in Ottawa.** One person takes each order from start to finish: accept it, shop it in the store, drive it over and hand it off with a photo.

Part of [Rabbit](https://github.com/mertmetin/rabbit-server): [backend](https://github.com/mertmetin/rabbit-server) · [customer app](https://github.com/mertmetin/rabbit-app) · **driver app** · [2021 API](https://github.com/mertmetin/rabbit-api)

## The driver's flow

1. **Go online at a store.** Customers can only order from a store while a driver is online there, so this is what "opens" a store in the customer app.
2. **Get new orders** by push notification and accept one with a tap. The order card shows the basket, the delivery address and the tip (all of the tip goes to the driver).
3. **Shop the list.** For each item, mark what was found (or a different quantity). *Done shopping* charges the customer's card for exactly what was found, not the original estimate.
4. **Deliver with in-app turn-by-turn navigation.** The route is drawn on the map with drive time and distance; spoken directions announce each turn early and again just before it, and the app re-routes if the driver leaves the route. Location keeps sharing with the phone locked, so the customer can follow along.
5. **Hand off.** On arrival the app says what to do next, and a doorstep photo of the bag (from the camera or photo library) is required to finish the delivery.

## Engineering

- **Stack:** Expo SDK (React Native), **Expo Router** with file-based routes, TypeScript throughout.
- **Background location:** `expo-location` with `expo-task-manager`, so location updates continue while the screen is off, and `expo-keep-awake` while navigating.
- **Navigation:** Apple Maps directions drawn on `react-native-maps`, with a small step tracker (`lib/useNavigation.ts`) that works out the next turn from the driver's position and heading and speaks it with `expo-speech`.
- **Push:** `expo-notifications`, registered with the backend after sign-in.
- **Auth:** drivers sign in with the phone number the store registered and a text code, against the [backend](https://github.com/mertmetin/rabbit-server); the JWT is kept in AsyncStorage and checked for expiry on start-up.
- **Builds:** development builds talk to a local server; release builds use the production API.

## Layout

```
src/app/              routes (Expo Router)
  login.tsx           sign in
  index.tsx           online/offline, new and active orders
  order/[id].tsx      order detail: shopping list, pick up, deliver
  navigate/[id].tsx   turn-by-turn to the customer, arrival and photo
src/lib/              API client, session, push, location, route and navigation hooks
src/components/       order card, logo
```

## Run locally

```bash
npm install
npx expo start          # development server; API defaults to the local backend on port 3000
npx expo run:ios        # development build (needed for background location and maps)
npx tsc --noEmit && npx expo lint
```

Run the [backend](https://github.com/mertmetin/rabbit-server) locally and create a driver account from its admin dashboard (`/admin`).
