import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DriverOrder } from "@/lib/api";
import { money, theme } from "@/lib/theme";

export const STATUS: Record<DriverOrder["status"], { label: string; color: string }> = {
  placed: { label: "New order", color: theme.muted },
  preparing: { label: "Preparing", color: theme.muted },
  ready: { label: "Ready", color: theme.primary },
  out_for_delivery: { label: "On the way", color: theme.primaryDark },
  delivered: { label: "Delivered", color: theme.muted },
  cancelled: { label: "Cancelled", color: theme.danger },
};

export function OrderCard({ order, onPress, action }: { order: DriverOrder; onPress: () => void; action?: React.ReactNode }) {
  const status = STATUS[order.status];
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.id}>#{order.id}</Text>
        <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
      </View>
      <Text style={styles.address} numberOfLines={1}>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}</Text>
      <Text style={styles.meta}>
        {order.customer.name || "Customer"} · {order.item_count} items · {money(order.total)}{order.tip > 0 ? ` · 💚 ${money(order.tip)} tip` : ""}
        {order.contactless ? " · Contactless" : ""}
      </Text>
      {action}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.white, borderRadius: 16, padding: 16, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  id: { fontSize: 17, fontWeight: "800", color: theme.text },
  status: { fontSize: 14, fontWeight: "700" },
  address: { fontSize: 16, fontWeight: "600", color: theme.text, marginTop: 4 },
  meta: { fontSize: 14, color: theme.muted },
});
