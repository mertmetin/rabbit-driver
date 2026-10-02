import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, type DriverOrder, type Store } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useDeliveryLocation } from "@/lib/useDeliveryLocation";
import { theme } from "@/lib/theme";
import { OrderCard } from "@/components/OrderCard";

const REFRESH_MS = 8000;

export default function Home() {
  const { driver, signOut } = useSession();
  const [online, setOnline] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [mine, setMine] = useState<DriverOrder[]>([]);
  const [available, setAvailable] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Share location while carrying anything that's on the way.
  useDeliveryLocation(mine.some((o) => o.status === "out_for_delivery"));

  const loadOrders = useCallback(async () => {
    try {
      const res = await api<{ mine: DriverOrder[]; available: DriverOrder[] }>("driver/orders");
      setMine(res.mine);
      setAvailable(res.available);
    } catch {
      // Keep showing the last list; the next refresh will try again.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<{ online: boolean; store: Store | null }>("driver/status").then((s) => {
      setOnline(s.online);
      setStore(s.store);
    }).catch(() => {});
    api<Store[]>("stores").then(setStores).catch(() => {});
  }, []);

  // Refresh while this screen is showing.
  useFocusEffect(useCallback(() => {
    loadOrders();
    const timer = setInterval(loadOrders, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadOrders]));

  const setStatus = async (next: boolean, storeId = store?.id) => {
    setBusy(true);
    try {
      const res = await api<{ online: boolean; store: Store | null }>("driver/status", { method: "PUT", body: { online: next, store_id: storeId } });
      setOnline(res.online);
      setStore(res.store);
      loadOrders();
    } catch (err) {
      Alert.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (order: DriverOrder) => {
    try {
      await api(`driver/orders/${order.id}/accept`, { method: "POST" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/order/[id]", params: { id: order.id } });
    } catch (err) {
      Alert.alert((err as Error).message);
      loadOrders();
    }
  };

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => (
          <Pressable onPress={() => Alert.alert("Sign out?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: signOut }])} hitSlop={10}>
            <Text style={{ color: theme.white, fontWeight: "600" }}>Sign out</Text>
          </Pressable>
        ),
      }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadOrders} />}>
        <Text style={styles.hello}>Hi {driver?.name?.split(" ")[0] || "there"} 👋</Text>

        <View style={[styles.card, online && styles.onlineCard]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, online && styles.onlineText]}>{online ? "You're online" : "You're offline"}</Text>
              <Text style={[styles.statusSub, online && styles.onlineText]}>
                {online ? `Taking orders from ${store?.name}` : "Go online to see orders ready for pickup"}
              </Text>
            </View>
            {busy ? <ActivityIndicator color={online ? theme.white : theme.primary} />
              : <Switch value={online} onValueChange={(v) => setStatus(v)} trackColor={{ true: theme.accent }} disabled={!online && !store} />}
          </View>
          {!online && (
            <View style={styles.stores}>
              <Text style={styles.label}>Your store today</Text>
              <View style={styles.chips}>
                {stores.map((s) => (
                  <Pressable key={s.id} style={[styles.chip, store?.id === s.id && styles.chipOn]} onPress={() => setStore(s)}>
                    <Text style={[styles.chipText, store?.id === s.id && styles.chipTextOn]}>{s.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.section}>Your deliveries {mine.length ? `(${mine.length})` : ""}</Text>
        {mine.length === 0
          ? <Text style={styles.empty}>Nothing assigned to you right now.</Text>
          : mine.map((o) => <OrderCard key={o.id} order={o} onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })} />)}

        {online && (
          <>
            <Text style={styles.section}>New orders {available.length ? `(${available.length})` : ""}</Text>
            {loading ? <ActivityIndicator /> : available.length === 0
              ? <Text style={styles.empty}>No orders waiting. New ones show up here automatically.</Text>
              : available.map((o) => (
                <OrderCard key={o.id} order={o} onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}
                  action={
                    <Pressable style={styles.accept} onPress={() => accept(o)}>
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                  } />
              ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hello: { fontSize: 22, fontWeight: "800", color: theme.text },
  card: { backgroundColor: theme.white, borderRadius: 18, padding: 18, gap: 14 },
  onlineCard: { backgroundColor: theme.primary },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  statusSub: { marginTop: 2, fontSize: 14, color: theme.muted },
  onlineText: { color: theme.white },
  stores: { gap: 8 },
  label: { fontSize: 13, fontWeight: "700", color: theme.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: theme.border },
  chipOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  chipText: { fontWeight: "600", color: theme.text },
  chipTextOn: { color: theme.primary },
  section: { marginTop: 10, fontSize: 18, fontWeight: "800", color: theme.text },
  empty: { color: theme.muted, fontSize: 15 },
  accept: { marginTop: 10, height: 46, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  acceptText: { color: theme.white, fontSize: 16, fontWeight: "700" },
});
