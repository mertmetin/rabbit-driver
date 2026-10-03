import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

// New-order alerts for drivers (sent by the server through Expo's push
// service). Shown even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registered: string | null = null;

// Registers this phone for the signed-in driver's alerts, asking for
// permission if needed. Needs the EAS project id (app.json extra.eas.projectId).
export async function registerForPush() {
  if (Platform.OS === "web") return null;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      if (__DEV__) console.log("Push: no EAS project id yet (run eas init).");
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("user/push-token", { body: { token, app: "driver" } });
    registered = token;
    return token;
  } catch (err) {
    if (__DEV__) console.log("Push registration failed", (err as Error).message);
    return null;
  }
}

// Signing out: this phone stops getting that driver's alerts.
export async function unregisterForPush() {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api("user/push-token", { method: "DELETE", body: { token } }).catch(() => {});
}
