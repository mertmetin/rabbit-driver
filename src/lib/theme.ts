// Same brand as the customer app.
export const theme = {
  primary: "#00754a",
  primaryDark: "#005c3a",
  primarySoft: "#e6f2ec",
  accent: "#ffc845",
  text: "#1d1d1b",
  muted: "#6b6f76",
  border: "#e7e7ec",
  background: "#f6f6f8",
  white: "#ffffff",
  danger: "#d64545",
};

export const money = (dollars: number) => `$${dollars.toFixed(2)}`;

export function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
