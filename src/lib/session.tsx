import { jwtPayload } from "./jwt";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearToken, loadToken, saveToken, setSignedOutHandler } from "./api";
import { registerForPush, unregisterForPush } from "./push";

type Driver = { id: number; name: string; phone: string; role: string };
type Session = {
  driver: Driver | null;
  loading: boolean;
  signIn: (token: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

// Who's signed in. Only driver (and admin) accounts may use this app.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSignedOutHandler(() => setDriver(null));
    loadToken().then((token) => {
      const payload = token ? jwtPayload(token) : null;
      if (payload && (payload.role === "driver" || payload.role === "admin")) {
        setDriver(payload as Driver);
        registerForPush();
      }
      setLoading(false);
    });
  }, []);

  const signIn = async (token: string) => {
    const payload = jwtPayload(token);
    if (!payload || (payload.role !== "driver" && payload.role !== "admin")) {
      return "This number isn't set up as a Rabbit driver. Ask the store to add you.";
    }
    await saveToken(token);
    setDriver(payload as Driver);
    registerForPush(); // drivers want new-order alerts: ask right away
    return null;
  };

  const signOut = async () => {
    await unregisterForPush();
    await clearToken();
    setDriver(null);
  };

  return <Ctx.Provider value={{ driver, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
