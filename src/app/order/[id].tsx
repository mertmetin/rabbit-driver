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

const STEPS: DriverOrder["status"][] = ["preparing", "ready", "out_for_delivery", "delivered"];

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
  // While shopping: how many of each item were found (item id -> count).
  // Starts at everything ordered; adjust what's missing.
  const [found, setFound] = useState<Record<number, number>>({});
  const foundOf = (item: DriverOrder["items"][number]) => found[item.id] ?? item.quantity;
  const setFoundOf = (item: DriverOrder["items"][number], count: number) =>
    setFound((f) => ({ ...f, [item.id]: Math.max(0, Math.min(item.quantity, count)) }));

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

  // "Start delivery": tells the customer it's on the way and opens directions
  // to them in one tap, so navigating never skips the status update.
  const startDelivery = async () => {
    if (!order) return;
    const ok = await act("pickup");
    const { address: to } = order;
    if (ok && to.latitude !== null && to.longitude !== null) navigateTo(to.latitude, to.longitude, to.line1);
  };

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
      return true;
    } catch (err) {
      Alert.alert((err as Error).message);
      load().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Done shopping: the server charges exactly what was found.
  const finishShopping = () => {
    if (!order) return;
    const missing = order.items.filter((i) => foundOf(i) < i.quantity);
    const foundValue = order.items.reduce((sum, i) => sum + i.unit_price * foundOf(i), 0);
    const nothing = order.items.every((i) => foundOf(i) === 0);
    const summary = nothing
      ? "Nothing was found, so the order will be cancelled and the customer won't be charged."
      : missing.length === 0
        ? "Everything was found."
        : `Missing: ${missing.map((i) => `${i.quantity - foundOf(i)} × ${i.title}`).join(", ")}. The customer isn't charged for these.`;
    Alert.alert(nothing ? "Cancel the order?" : `Charge for ${money(foundValue)} of groceries?`, `${summary}\n\nDelivery and HST are added by the server.`, [
      { text: "Back", style: "cancel" },
      {
        text: nothing ? "Cancel order" : "Done shopping",
        style: nothing ? "destructive" : "default",
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api<DriverOrder>(`driver/orders/${id}/shopped`, {
              method: "POST",
              body: { items: order.items.map((i) => ({ id: i.id, found_quantity: foundOf(i) })) },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (res.status === "cancelled") {
              Alert.alert("Order cancelled", "The customer's card hold was released.", [{ text: "Back to orders", onPress: () => router.back() }]);
              return;
            }
            await load();
            Alert.alert("Charged", `The customer paid ${money(res.total)}. Start the delivery now?`, [
              { text: "Later", style: "cancel" },
              { text: "Start delivery", onPress: startDelivery },
            ]);
          } catch (err) {
            Alert.alert((err as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
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
  // Shopped or on the way: next stop is the customer. Before that, the store.
  const pickedUp = order.status === "ready" || order.status === "out_for_delivery";
  const target = pickedUp && hasCustomerPin
    ? { lat: address.latitude!, lng: address.longitude!, label: address.line1 }
    : { lat: order.store.latitude, lng: order.store.longitude, label: order.store.name };

  let action: { label: string; onPress?: () => void; hint?: string };
  const shopping = mine && (order.status === "placed" || order.status === "preparing") && !order.charged;
  if (!mine) action = { label: "Accept order", onPress: () => act("accept") };
  else if (shopping) action = { label: "Done shopping", onPress: finishShopping, hint: "Set how many of each item you found." };
  else if (order.status === "ready") action = { label: "Start delivery", onPress: startDelivery, hint: "Tells the customer you're on the way and opens directions." };
  else if (order.status === "out_for_delivery") {
    const confirmDelivered = () => Alert.alert("Delivered?", `Confirm order #${order.id} was handed over${order.contactless ? " (left at the door)" : ""}.`, [
      { text: "Not yet", style: "cancel" },
      { text: "Delivered", onPress: () => act("deliver") },
    ]);
    action = {
      label: "Mark delivered",
      // Contactless drop-offs need a photo of where it was left (the server
      // won't accept "delivered" without one).
      onPress: order.contactless && !order.has_photo
        ? () => Alert.alert("Photo needed", "This is a contactless delivery. Take a photo of where you left the order.", [
            { text: "Cancel", style: "cancel" },
            { text: "Take photo", onPress: async () => { if (await takePhoto()) confirmDelivered(); } },
          ])
        : confirmDelivered,
    };
  } else action = { label: "Waiting", hint: "This order isn't ready yet." };

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
          <Text style={styles.cardLabel}>{pickedUp ? "Deliver to" : "Shop at"}</Text>
          <Text style={styles.big}>{pickedUp ? address.line1 : order.store.name}</Text>
          {pickedUp && <Text style={styles.muted}>{[address.line2, address.city, address.postal_code].filter(Boolean).join(", ")}</Text>}
          <Pressable style={styles.secondary} onPress={() => (order.status === "ready" && mine ? startDelivery() : navigateTo(target.lat, target.lng, target.label))}>
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
            <Text style={styles.cardLabel}>Doorstep photo{order.contactless ? " (required)" : ""}</Text>
            <Text style={styles.muted}>{order.has_photo ? "Photo added. The customer can see it." : "Show the customer where you left their order."}</Text>
            <Pressable style={styles.secondary} onPress={takePhoto} disabled={busy}>
              <Ionicons name="camera" size={18} color={theme.primary} />
              <Text style={styles.secondaryText}>{order.has_photo ? "Retake photo" : "Take photo"}</Text>
            </Pressable>
          </View>
        )}

        {shopping ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Shopping list · {order.item_count} items · up to {money(order.total)}</Text>
            {order.tip > 0 && <Text style={styles.tipLine}>💚 {money(order.tip)} tip, all yours</Text>}
            <Text style={styles.subs}>
              {order.substitutions === "similar"
                ? "🔄 If something's missing: replace it with something similar, at no more than its price."
                : "⏭️ If something's missing: skip it."}
            </Text>
            {order.items.map((item) => {
              const count = foundOf(item);
              return (
                <View key={item.id} style={styles.shopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.item, count === 0 && styles.struck]}>{item.title}</Text>
                    <Text style={styles.muted}>{item.quantity} ordered · {money(item.unit_price)} each</Text>
                  </View>
                  <Pressable style={styles.stepBtn} onPress={() => setFoundOf(item, count - 1)} hitSlop={6}>
                    <Ionicons name="remove" size={20} color={theme.primary} />
                  </Pressable>
                  <Text style={[styles.count, count < item.quantity && styles.countShort]}>{count}</Text>
                  <Pressable style={styles.stepBtn} onPress={() => setFoundOf(item, count + 1)} hitSlop={6}>
                    <Ionicons name="add" size={20} color={theme.primary} />
                  </Pressable>
                  <Pressable onPress={() => setFoundOf(item, count === 0 ? item.quantity : 0)} hitSlop={6}>
                    <Text style={styles.noneText}>{count === 0 ? "Found" : "None"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{order.item_count} items · {money(order.total)} {order.charged ? "(charged)" : "(card held)"}</Text>
            {order.tip > 0 && <Text style={styles.tipLine}>💚 {money(order.tip)} tip, all yours</Text>}
            {order.items.map((item) => {
              const count = item.found_quantity ?? item.quantity;
              return (
                <Text key={item.id} style={[styles.item, count === 0 && styles.struck]}>
                  <Text style={{ fontWeight: "800" }}>{count} ×</Text> {item.title}
                  {count < item.quantity ? `  (${item.quantity - count} not found)` : ""}
                </Text>
              );
            })}
          </View>
        )}
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
  subs: { marginTop: 6, marginBottom: 4, fontSize: 14, color: theme.text, backgroundColor: theme.background, padding: 10, borderRadius: 10, overflow: "hidden" },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: theme.primary, alignItems: "center", justifyContent: "center" },
  count: { minWidth: 22, textAlign: "center", fontSize: 18, fontWeight: "800", color: theme.text },
  countShort: { color: theme.danger },
  noneText: { color: theme.danger, fontWeight: "700", fontSize: 13, width: 44, textAlign: "right" },
  tipLine: { fontSize: 15, fontWeight: "700", color: theme.primary, marginTop: 2 },
  struck: { textDecorationLine: "line-through", color: theme.muted },
});
