import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useKeepAwake } from "expo-keep-awake";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type DriverOrder } from "@/lib/api";
import { theme } from "@/lib/theme";
import { shortDistance, useNavigation } from "@/lib/useNavigation";
import { markDelivered, takeDoorstepPhoto } from "@/lib/doorstep";

// An arrow for the next turn, from the words of Apple's instruction.
function turnIcon(instruction: string, arrived: boolean): keyof typeof Ionicons.glyphMap {
  const text = instruction.toLowerCase();
  if (arrived || text.includes("arrive") || text.includes("destination")) return "flag";
  if (text.includes("u-turn") || text.includes("make a u")) return "return-up-back";
  if (text.includes("left")) return "arrow-back";
  if (text.includes("right")) return "arrow-forward";
  if (text.includes("roundabout")) return "refresh";
  return "arrow-up";
}

// The point `meters` from `p` in direction `heading` (degrees); p itself
// when there's no direction yet.
function ahead(p: { latitude: number; longitude: number }, heading: number | null, meters: number) {
  if (heading == null) return { latitude: p.latitude, longitude: p.longitude };
  const r = (heading * Math.PI) / 180;
  return {
    latitude: p.latitude + (meters * Math.cos(r)) / 111_320,
    longitude: p.longitude + (meters * Math.sin(r)) / (111_320 * Math.cos((p.latitude * Math.PI) / 180)),
  };
}

const clock = (secondsFromNow: number) =>
  new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

// Turn-by-turn navigation inside the app: the map follows the driver, the
// next turn is in a banner at the top and spoken, and arrival time, minutes
// and kilometres left are at the bottom. `to` is "store" (while shopping) or
// "customer" (delivering).
export default function Navigate() {
  useKeepAwake();
  const { id, to } = useLocalSearchParams<{ id: string; to: "store" | "customer" }>();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<DriverOrder | null>(null);
  const [voice, setVoice] = useState(true);
  const [following, setFollowing] = useState(true);
  // Finishing at the door, right here: photo (contactless), then delivered.
  const [photoTaken, setPhotoTaken] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const map = useRef<MapView>(null);

  useFocusEffect(useCallback(() => {
    api<{ mine: DriverOrder[]; available: DriverOrder[] }>("driver/orders")
      .then((res) => setOrder(res.mine.find((o) => String(o.id) === id) ?? null))
      .catch(() => {});
  }, [id]));

  const toCustomer = to !== "store";
  const destination = !order
    ? null
    : toCustomer
      ? order.address.latitude !== null && order.address.longitude !== null
        ? { latitude: order.address.latitude, longitude: order.address.longitude }
        : null
      : { latitude: order.store.latitude, longitude: order.store.longitude };
  const placeName = !order ? "" : toCustomer ? order.address.line1 : order.store.name;
  // What to do on arrival, said out loud and shown.
  const firstName = order?.customer.name.split(" ")[0] || "the customer";
  const arrival = !order
    ? undefined
    : !toCustomer
      ? "You've arrived at the store. Time to shop!"
      : order.contactless
        ? "You've arrived. Leave the order at the door and take a photo."
        : `You've arrived. Hand the order to ${firstName}.`;
  const nav = useNavigation(destination, placeName, voice, arrival);

  // Keep the camera behind the driver, turned the way they're heading.
  useEffect(() => {
    const pos = nav.position;
    if (!pos || !following) return;
    map.current?.animateCamera(
      {
        // Aim ~70 m ahead, so the driver sits low on the screen and sees more
        // of the road coming up (as Apple Maps does).
        center: ahead(pos.coords, nav.heading, 70),
        heading: nav.heading ?? undefined,
        pitch: 55,
        altitude: 350,
        zoom: 18,
      },
      { duration: 900 },
    );
  }, [nav.position, nav.heading, following]);

  const takePhoto = async () => {
    if (!order) return;
    setFinishing(true);
    if (await takeDoorstepPhoto(order.id)) setPhotoTaken(true);
    setFinishing(false);
  };

  const deliver = () => {
    if (!order) return;
    Alert.alert("Delivered?", `Order #${order.id}${order.contactless ? " left at the door" : " handed over"}.`, [
      { text: "Not yet", style: "cancel" },
      {
        text: "Delivered",
        onPress: async () => {
          setFinishing(true);
          const ok = await markDelivered(order.id);
          setFinishing(false);
          if (ok) Alert.alert("Delivered 🎉", "Nice work!", [{ text: "Back to orders", onPress: () => router.dismissAll() }]);
        },
      },
    ]);
  };

  const exit = () =>
    Alert.alert("Stop navigating?", "The delivery stays on the way. You can come back from the order.", [
      { text: "Keep going", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => router.back() },
    ]);

  const openInMaps = () => {
    if (!destination) return;
    const { latitude: lat, longitude: lng } = destination;
    const url = Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  if (!order || !destination) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        showsCompass={false}
        // Only a finger moving the map stops following (the camera updates
        // above move it too).
        onRegionChange={(_, details) => { if (details?.isGesture) setFollowing(false); }}
        initialRegion={{ ...destination, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      >
        {nav.route && <Polyline coordinates={nav.route.coordinates} strokeColor={theme.primary} strokeWidth={8} />}
        <Marker coordinate={destination} title={placeName} pinColor={toCustomer ? theme.danger : theme.primary} />
      </MapView>

      {/* Next turn */}
      <View style={[styles.banner, { paddingTop: insets.top + 10 }]}>
        <Ionicons name={turnIcon(nav.nextInstruction, nav.arrived)} size={44} color={theme.white} />
        <View style={{ flex: 1 }}>
          {!nav.arrived && nav.route && <Text style={styles.turnDistance}>{shortDistance(nav.metersToTurn)}</Text>}
          <Text style={styles.turnText} numberOfLines={3}>
            {nav.route || nav.arrived ? nav.nextInstruction : nav.rerouting ? "Finding a route…" : "Getting your location…"}
          </Text>
        </View>
        <Pressable onPress={() => setVoice(!voice)} hitSlop={10} accessibilityLabel={voice ? "Mute directions" : "Speak directions"}>
          <Ionicons name={voice ? "volume-high" : "volume-mute"} size={26} color={theme.white} />
        </Pressable>
      </View>

      {!following && (
        <Pressable style={[styles.recenter, { top: insets.top + 130 }]} onPress={() => setFollowing(true)}>
          <Ionicons name="navigate" size={18} color={theme.primary} />
          <Text style={styles.recenterText}>Re-centre</Text>
        </Pressable>
      )}

      {/* Arrival, time and distance left */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {nav.arrived ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.arrivedTitle}>{toCustomer ? `${placeName} 🏠` : `${placeName} 🛒`}</Text>
            <Text style={styles.arrivedText}>{nav.arrivalMessage}</Text>
            {toCustomer && (
              <>
                {(order.contactless || order.no_bell) && (
                  <View style={styles.tags}>
                    {order.contactless && <Text style={styles.tag}>Contactless</Text>}
                    {order.no_bell && <Text style={styles.tag}>{"Don't ring the bell"}</Text>}
                  </View>
                )}
                {order.address.line2 && <Text style={styles.note}>🚪 {order.address.line2}</Text>}
                {order.address.notes && <Text style={styles.note}>🏠 {order.address.notes}</Text>}
                {order.notes && <Text style={styles.note}>📝 {order.notes}</Text>}
              </>
            )}
            {!toCustomer ? (
              <Pressable style={styles.primary} onPress={() => router.back()}>
                <Text style={styles.primaryText}>🛒 Start shopping</Text>
              </Pressable>
            ) : order.contactless && !photoTaken && !order.has_photo ? (
              <Pressable style={[styles.primary, finishing && { opacity: 0.6 }]} onPress={takePhoto} disabled={finishing}>
                {finishing ? <ActivityIndicator color={theme.white} /> : <Text style={styles.primaryText}>📷 Take photo</Text>}
              </Pressable>
            ) : (
              <Pressable style={[styles.primary, finishing && { opacity: 0.6 }]} onPress={deliver} disabled={finishing}>
                {finishing ? <ActivityIndicator color={theme.white} /> : <Text style={styles.primaryText}>✅ Mark delivered</Text>}
              </Pressable>
            )}
            {toCustomer && (photoTaken || order.has_photo) && <Text style={styles.photoDone}>📷 Photo added. The customer can see it.</Text>}
          </View>
        ) : (
          <View style={styles.tripRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eta}>{nav.route ? clock(nav.secondsLeft) : "--:--"}</Text>
              <Text style={styles.left}>
                {nav.route ? `${Math.max(1, Math.round(nav.secondsLeft / 60))} min · ${shortDistance(nav.metersLeft)}` : " "} · {placeName}
              </Text>
            </View>
            <Pressable style={styles.iconButton} onPress={openInMaps} accessibilityLabel="Open in Apple Maps">
              <Ionicons name="map-outline" size={22} color={theme.primary} />
            </Pressable>
            <Pressable style={styles.end} onPress={exit}>
              <Text style={styles.endText}>Exit</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: {
    position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 18, paddingBottom: 16, backgroundColor: theme.primary,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
  },
  turnDistance: { color: theme.accent, fontSize: 30, fontWeight: "800" },
  turnText: { color: theme.white, fontSize: 21, fontWeight: "700" },
  recenter: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.white, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
  },
  recenterText: { color: theme.primary, fontWeight: "700" },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: theme.white,
    paddingHorizontal: 18, paddingTop: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
  tripRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  eta: { fontSize: 28, fontWeight: "800", color: theme.primary },
  left: { fontSize: 15, color: theme.muted, marginTop: 2 },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: theme.primary, alignItems: "center", justifyContent: "center" },
  end: { height: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: theme.danger, alignItems: "center", justifyContent: "center" },
  endText: { color: theme.white, fontWeight: "800", fontSize: 16 },
  arrivedTitle: { fontSize: 22, fontWeight: "800", color: theme.text },
  arrivedText: { fontSize: 17, fontWeight: "600", color: theme.primary },
  tags: { flexDirection: "row", gap: 8 },
  tag: { backgroundColor: theme.accent, color: theme.text, fontWeight: "700", fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  note: { fontSize: 15, color: theme.text },
  photoDone: { fontSize: 14, color: theme.muted, textAlign: "center" },
  primary: { height: 56, borderRadius: 14, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: theme.white, fontSize: 18, fontWeight: "800" },
});
