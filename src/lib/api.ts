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

// Messages people can act on, instead of "fetch failed" or a stack trace.
const OFFLINE_MESSAGE = "Can't reach Rabbit. Check your internet connection and try again.";
const SERVER_MESSAGE = "Something went wrong on our side. Please try again in a moment.";

// fetch, turning "no connection" into an ApiError with a readable message.
async function send(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
}

// The response body as JSON, or null (a proxy's HTML error page isn't).
async function readBody(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// The server's own message (written for people) for 4xx; ours otherwise.
const errorMessage = (status: number, data: { message?: string } | null) =>
  status < 500 && data?.message ? data.message : SERVER_MESSAGE;

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await send(baseUrl() + path, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await readBody(res);
  if (!res.ok) {
    if (res.status === 401 && token) {
      await AsyncStorage.removeItem(TOKEN_KEY);
      onSignedOut();
    }
    throw new ApiError(res.status, errorMessage(res.status, data));
  }
  return data as T;
}

// Uploads a file (multipart form) to the API.
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await send(baseUrl() + path, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, data));
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
  items: { id: number; title: string; quantity: number; unit_price: number; found_quantity: number | null }[];
  // The customer's choice for items that can't be found.
  substitutions: "similar" | "skip";
  // false: the card is only authorized; "Done shopping" charges what was found.
  charged: boolean;
  total: number;
  // All tips on the order (checkout + after delivery); 100% the driver's.
  tip: number;
  placed_at: string | null;
  picked_up_at: string | null;
  has_photo: boolean;
};

export type Store = { id: number; name: string };
