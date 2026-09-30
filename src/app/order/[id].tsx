import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, apiUpload, type DriverOrder } from "@/lib/api";
import { formatPhone, money, theme } from "@/lib/theme";
import { STATUS } from "@/components/OrderCard";

const STEPS: DriverOrder["status"][] = ["ready", "out_for_delivery", "delivered"];

// Opens Apple Maps / Google Maps with directions.
function navigateTo(lat: number, lng: number, label: string) {
  const url = Platform.OS === "ios"
    ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`
    : `google.navigation:q=${lat},${lng}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

export default function Delivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<DriverOrder | null>(null);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ mine: DriverOrder[]; available: DriverOrder[] }>("driver/orders");
    const own = res.mine.find((o) => String(o.id) === id);
    const open = res.available.find((o) => String(o.id) === id);
    setMine(Boolean(own));
    setOrder(own ?? open ?? null);
  }, [id]);

  useFocusEffect(useCallback(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [load]));

  const act = async (path: "accept" | "pickup" | "deliver") => {
    setBusy(true);
    try {
      await api(`driver/orders/${id}/${path}`, { method: "POST" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (path === "deliver") {
        Alert.alert("Delivered 🎉", "Nice work!", [{ text: "Back to orders", onPress: () => router.back() }]);
        return;
      }
      await load();
    } catch (err) {
      Alert.alert((err as Error).message);
      load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  // Photo of where the order was left. Uses the camera; the simulator has
  // none, so it falls back to the photo library there.
  const takePhoto = async () => {
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
    setBusy(true);
    try {
      await apiUpload(`driver/orders/${id}/photo`, form);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      return true;
    } catch (err) {
      Alert.alert((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Loading order #{id}…</Text></View>;
  }

  const { address } = order;
  const hasCustomerPin = address.latitude !== null && address.longitude !== null;
  const pickedUp = order.status === "out_for_delivery";
  const target = pickedUp && hasCustomerPin
    ? { lat: address.latitude!, lng: address.longitude!, label: address.line1 }
    : { lat: order.store.latitude, lng: order.store.longitude, label: order.store.name };

  let action: { label: string; onPress?: () => void; hint?: string };
  if (!mine) action = { label: "Accept order", onPress: () => act("accept") };
  else if (order.status === "ready") action = { label: "Picked up", onPress: () => act("pickup") };
  else if (order.status === "out_for_delivery") {
    const confirmDelivered = () => Alert.alert("Delivered?", `Confirm order #${order.id} was handed over${order.contactless ? " (left at the door)" : ""}.`, [
      { text: "Not yet", style: "cancel" },
      { text: "Delivered", onPress: () => act("deliver") },
    ]);
    action = {
      label: "Mark delivered",
      // Contactless drop-offs should come with a photo of where it was left.
      onPress: order.contactless && !order.has_photo
        ? () => Alert.alert("Add a photo?", "The customer asked for contactless delivery. Take a photo of where you left it.", [
            { text: "Skip", style: "cancel", onPress: confirmDelivered },
            { text: "Take photo", onPress: async () => { if (await takePhoto()) confirmDelivered(); } },
          ])
        : confirmDelivered,
    };
  } else action = { label: "Waiting for the store", hint: "The store is still packing this order." };

  return (
    <>
      <Stack.Screen options={{ title: `Order #${order.id}` }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: (order.store.latitude + (address.latitude ?? order.store.latitude)) / 2,
            longitude: (order.store.longitude + (address.longitude ?? order.store.longitude)) / 2,
            latitudeDelta: Math.max(Math.abs(order.store.latitude - (address.latitude ?? order.store.latitude)) * 2.2, 0.02),
            longitudeDelta: Math.max(Math.abs(order.store.longitude - (address.longitude ?? order.store.longitude)) * 2.2, 0.02),
          }}
          showsUserLocation
        >
          <Marker coordinate={{ latitude: order.store.latitude, longitude: order.store.longitude }} title={order.store.name} pinColor={theme.primary} />
          {hasCustomerPin && <Marker coordinate={{ latitude: address.latitude!, longitude: address.longitude! }} title={order.customer.name || "Customer"} />}
        </MapView>

        <View style={styles.steps}>
          {STEPS.map((step, i) => {
            const reached = STEPS.indexOf(order.status) >= i;
            return (
              <View key={step} style={styles.step}>
                <View style={[styles.dot, reached && styles.dotOn]} />
                <Text style={[styles.stepText, reached && styles.stepTextOn]}>{STATUS[step].label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{pickedUp ? "Deliver to" : "Pick up from"}</Text>
          <Text style={styles.big}>{pickedUp ? address.line1 : order.store.name}</Text>
          {pickedUp && <Text style={styles.muted}>{[address.line2, address.city, address.postal_code].filter(Boolean).join(", ")}</Text>}
          <Pressable style={styles.secondary} onPress={() => navigateTo(target.lat, target.lng, target.label)}>
            <Ionicons name="navigate" size={18} color={theme.primary} />
            <Text style={styles.secondaryText}>Navigate</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Customer</Text>
          <Text style={styles.big}>{order.customer.name || "Customer"}</Text>
          <Text style={styles.muted}>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</Text>
          {(order.contactless || order.no_bell) && (
            <View style={styles.tags}>
              {order.contactless && <Text style={styles.tag}>Contactless</Text>}
              {order.no_bell && <Text style={styles.tag}>{"Don't ring the bell"}</Text>}
            </View>
          )}
          {address.notes && <Text style={styles.note}>🏠 {address.notes}</Text>}
          {order.notes && <Text style={styles.note}>📝 {order.notes}</Text>}
          {mine && (
            <Pressable style={styles.secondary} onPress={() => Linking.openURL(`tel:+1${order.customer.phone}`)}>
              <Ionicons name="call" size={18} color={theme.primary} />
              <Text style={styles.secondaryText}>Call {formatPhone(order.customer.phone)}</Text>
            </Pressable>
          )}
        </View>

        {mine && order.status === "out_for_delivery" && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Doorstep photo</Text>
            <Text style={styles.muted}>{order.has_photo ? "Photo added. The customer can see it." : "Show the customer where you left their order."}</Text>
            <Pressable style={styles.secondary} onPress={takePhoto} disabled={busy}>
              <Ionicons name="camera" size={18} color={theme.primary} />
              <Text style={styles.secondaryText}>{order.has_photo ? "Retake photo" : "Take photo"}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{order.item_count} items · {money(order.total)} (paid)</Text>
          {order.items.map((item, i) => (
            <Text key={i} style={styles.item}><Text style={{ fontWeight: "800" }}>{item.quantity} ×</Text> {item.title}</Text>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {action.hint && <Text style={styles.hint}>{action.hint}</Text>}
        <Pressable style={[styles.primary, (!action.onPress || busy) && styles.disabled]} disabled={!action.onPress || busy} onPress={action.onPress}>
          {busy ? <ActivityIndicator color={theme.white} /> : <Text style={styles.primaryText}>{action.label}</Text>}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  map: { height: 220 },
  steps: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  step: { flex: 1, alignItems: "center", gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.border },
  dotOn: { backgroundColor: theme.primary },
  stepText: { fontSize: 12, fontWeight: "600", color: theme.muted, textAlign: "center" },
  stepTextOn: { color: theme.primary },
  card: { backgroundColor: theme.white, borderRadius: 16, padding: 16, marginHorizontal: 16, gap: 4 },
  cardLabel: { fontSize: 13, fontWeight: "700", color: theme.muted },
  big: { fontSize: 19, fontWeight: "800", color: theme.text },
  muted: { fontSize: 14, color: theme.muted },
  tags: { flexDirection: "row", gap: 8, marginTop: 6 },
  tag: { backgroundColor: theme.accent, color: theme.text, fontWeight: "700", fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  note: { marginTop: 6, fontSize: 15, color: theme.text },
  item: { fontSize: 15, color: theme.text, paddingVertical: 2 },
  secondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: theme.primary },
  secondaryText: { color: theme.primary, fontWeight: "700", fontSize: 15 },
  footer: { padding: 16, paddingBottom: 34, backgroundColor: theme.white, borderTopWidth: 1, borderTopColor: theme.border, gap: 8 },
  hint: { textAlign: "center", color: theme.muted },
  primary: { height: 56, borderRadius: 14, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: theme.white, fontSize: 18, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
