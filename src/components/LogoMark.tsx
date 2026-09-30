import Svg, { Circle, Ellipse, G, Line } from "react-native-svg";
import { theme } from "@/lib/theme";

// The leaping rabbit (same drawing as the customer app's logo).
export function LogoMark({ size = 36, color = theme.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <G stroke={theme.accent} strokeWidth={20} strokeLinecap="round">
        <Line x1="44" y1="236" x2="118" y2="236" />
        <Line x1="64" y1="288" x2="104" y2="288" />
        <Line x1="40" y1="340" x2="96" y2="340" />
      </G>
      <G fill={color} transform="translate(-14 6)">
        <Ellipse cx="318" cy="150" rx="19" ry="74" transform="rotate(-58 318 150)" />
        <Ellipse cx="296" cy="176" rx="16" ry="66" transform="rotate(-72 296 176)" />
        <Ellipse cx="178" cy="346" rx="72" ry="22" transform="rotate(-18 178 346)" />
        <Ellipse cx="272" cy="296" rx="112" ry="62" transform="rotate(-14 272 296)" />
        <Circle cx="164" cy="286" r="26" />
        <Circle cx="370" cy="228" r="54" />
        <Ellipse cx="382" cy="336" rx="50" ry="17" transform="rotate(24 382 336)" />
      </G>
      <Circle cx="374" cy="222" r="8" fill={theme.primary} />
      <Circle cx="406" cy="242" r="7" fill={theme.accent} />
    </Svg>
  );
}
