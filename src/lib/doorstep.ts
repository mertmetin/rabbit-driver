import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api, apiUpload } from "./api";

// Photo of where an order was left, uploaded to the order. Uses the camera;
// the simulator has none, so it falls back to the photo library there.
// True once uploaded.
export async function takeDoorstepPhoto(orderId: number | string) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  let result: ImagePicker.ImagePickerResult;
  try {
    if (!perm.granted) throw new Error("no camera");
    result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
  } catch {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
  }
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
