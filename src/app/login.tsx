import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatPhone, theme } from "@/lib/theme";
import { LogoMark } from "@/components/LogoMark";

// Drivers sign in with the phone number the store added, and a text code.
export default function Login() {
  const { signIn } = useSession();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<TextInput>(null);
  const digits = phone.replace(/\D/g, "");

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ dev_code?: string }>("auth/start", { body: { phone: digits } });
      setDevCode(res.dev_code);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string }>("auth/verify", { body: { phone: digits, code: value } });
      const problem = await signIn(res.token);
      if (problem) {
        setError(problem);
        setStep("phone");
        setCode("");
      }
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const onCode = (value: string) => {
    const v = value.replace(/\D/g, "").slice(0, 6);
    setCode(v);
    if (v.length === 6) verify(v);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.hero}>
        <LogoMark size={88} />
        <Text style={styles.brand}>Rabbit Driver</Text>
      </View>

      <View style={styles.card}>
        {step === "phone" ? (
          <>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Use the phone number your store added.</Text>
            <View style={styles.field}>
              <Text style={styles.prefix}>🇨🇦 +1</Text>
              <TextInput style={styles.input} value={phone} onChangeText={(v) => setPhone(formatPhone(v))}
                placeholder="(613) 555-0100" placeholderTextColor={theme.muted} keyboardType="phone-pad" autoFocus />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>Sent to {formatPhone(digits)}.</Text>
            <TextInput ref={codeInput} style={[styles.field, styles.codeInput]} value={code} onChangeText={onCode}
              placeholder="000000" placeholderTextColor={theme.border} keyboardType="number-pad"
              textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus />
            {devCode && (
              <Pressable style={styles.dev} onPress={() => onCode(devCode)}>
                <Text style={styles.devText}>Dev code: <Text style={{ fontWeight: "700" }}>{devCode}</Text> (tap to fill)</Text>
              </Pressable>
            )}
            <Pressable onPress={() => { setStep("phone"); setCode(""); }} hitSlop={8}>
              <Text style={styles.link}>Use a different number</Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {step === "phone" && (
          <Pressable style={[styles.button, (digits.length !== 10 || busy) && styles.disabled]} disabled={digits.length !== 10 || busy} onPress={sendCode}>
            {busy ? <ActivityIndicator color={theme.white} /> : <Text style={styles.buttonText}>Send code</Text>}
          </Pressable>
        )}
        {step === "code" && busy && <ActivityIndicator style={{ marginTop: 12 }} color={theme.primary} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.primary, justifyContent: "flex-end" },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  brand: { color: theme.white, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  card: { backgroundColor: theme.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, gap: 12 },
  title: { color: theme.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: theme.muted, fontSize: 15 },
  field: { flexDirection: "row", alignItems: "center", height: 56, borderWidth: 1.5, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, gap: 12, marginTop: 6 },
  prefix: { fontSize: 18, fontWeight: "600", color: theme.text },
  input: { flex: 1, fontSize: 20, fontWeight: "600", color: theme.text },
  codeInput: { fontSize: 28, fontWeight: "800", letterSpacing: 10, textAlign: "center", color: theme.text },
  dev: { padding: 10, borderRadius: 10, backgroundColor: "#fff6dc", borderWidth: 1, borderColor: theme.accent },
  devText: { textAlign: "center", color: theme.text },
  link: { color: theme.primary, fontWeight: "700", marginTop: 4 },
  error: { color: theme.danger, fontWeight: "600" },
  button: { height: 54, borderRadius: 14, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", marginTop: 6 },
  disabled: { opacity: 0.45 },
  buttonText: { color: theme.white, fontSize: 17, fontWeight: "700" },
});
