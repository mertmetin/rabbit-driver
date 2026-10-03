import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api, apiUpload } from "./api";

// Camera or photo library? (The library is the way on the simulator, whose
// camera doesn't work, and a backup if the camera misbehaves.)
const chooseSource = () =>
  new Promise<"camera" | "library" | null>((resolve) =>
    Alert.alert("Doorstep photo", "Show the customer where you left their order.", [
      { text: "Camera", onPress: () => resolve("camera") },
      { text: "Photo library", onPress: () => resolve("library") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]),
  );

async function pick(source: "camera" | "library") {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      try {
        return await ImagePicker.launchCameraAsync({ quality: 0.6 });
      } catch {
        // No usable camera: fall through to the library.
      }
    }
  }
  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
}

// Photo of where an order was left, uploaded to the order. True once uploaded.
export async function takeDoorstepPhoto(orderId: number | string) {
  const source = await chooseSource();
  if (!source) return false;
  const result = await pick(source);
  if (result.canceled || !result.assets?.[0]) return false;

  const asset = result.assets[0];
  const form = new FormData();
  form.append("photo", { uri: asset.uri, name: "doorstep.jpg", type: asset.mimeType ?? "image/jpeg" } as unknown as Blob);
  try {
    await apiUpload(`driver/orders/${orderId}/photo`, form);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (err) {
    Alert.alert((err as Error).message);
    return false;
  }
}

// Marks the order delivered. True when done.
export async function markDelivered(orderId: number | string) {
  try {
    await api(`driver/orders/${orderId}/deliver`, { method: "POST" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (err) {
    Alert.alert((err as Error).message);
    return false;
  }
}
