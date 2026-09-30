import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "driver_token";

// The API runs on port 3000 of the machine serving this app in development;
// EXPO_PUBLIC_API_URL overrides it (e.g. a deployed server).
function baseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Platform.OS === "web" ? window.location.hostname : Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:3000/api/`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Called when the server says the session is no longer valid.
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await fetch(baseUrl() + path, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      await AsyncStorage.removeItem(TOKEN_KEY);
      onSignedOut();
    }
    throw new ApiError(res.status, data?.message ?? "Something went wrong.");
  }
  return data as T;
}

export const saveToken = (token: string) => AsyncStorage.setItem(TOKEN_KEY, token);
export const loadToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

// --- Types from the Rabbit server ---
export type DriverOrder = {
  id: number;
  status: "placed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  store: { id: number; name: string; latitude: number; longitude: number };
  customer: { name: string; phone: string };
  address: { line1: string; line2: string | null; city: string; postal_code: string | null; notes: string | null; latitude: number | null; longitude: number | null };
  notes: string | null;
  contactless: boolean;
  no_bell: boolean;
  item_count: number;
  items: { title: string; quantity: number }[];
  total: number;
  placed_at: string | null;
  picked_up_at: string | null;
};

export type Store = { id: number; name: string };
