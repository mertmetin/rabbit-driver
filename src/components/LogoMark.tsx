import Svg, { Circle, Ellipse, G, Line, Path } from "react-native-svg";
import { theme } from "@/lib/theme";

const BLUSH = "#f6c3c3"; // inner ear and cheeks

// The leaping rabbit winking at you, with speed lines (same drawing as the
// customer app's logo, assets/images/logo-mark.svg there).
export function LogoMark({ size = 36, color = theme.white, eye = theme.primary }: { size?: number; color?: string; eye?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <G transform="translate(34 6)">
        <G stroke={theme.accent} strokeWidth={22} strokeLinecap="round">
          <Line x1="34" y1="252" x2="112" y2="252" />
          <Line x1="58" y1="306" x2="108" y2="306" />
          <Line x1="30" y1="360" x2="94" y2="360" />
        </G>
        <G fill={color}>
          <Ellipse cx="168" cy="372" rx="72" ry="21" transform="rotate(-20 168 372)" />
          <Ellipse cx="262" cy="318" rx="112" ry="60" transform="rotate(-12 262 318)" />
          <Circle cx="156" cy="304" r="26" />
          <Ellipse cx="382" cy="362" rx="50" ry="17" transform="rotate(26 382 362)" />
          <Ellipse cx="302" cy="146" rx="21" ry="78" transform="rotate(-46 302 146)" />
          <Ellipse cx="340" cy="128" rx="21" ry="76" transform="rotate(-24 340 128)" />
          <Circle cx="352" cy="238" r="76" />
        </G>
        <Ellipse cx="342" cy="124" rx="9" ry="52" transform="rotate(-24 342 124)" fill={BLUSH} />
        <Circle cx="324" cy="232" r="14" fill={eye} />
        <Circle cx="329" cy="227" r="5" fill={color} />
        <Path d="M366 236 q16 -14 32 0" fill="none" stroke={eye} strokeWidth={8} strokeLinecap="round" />
        <Ellipse cx="306" cy="262" rx="12" ry="7" fill={BLUSH} />
        <Ellipse cx="398" cy="262" rx="12" ry="7" fill={BLUSH} />
        <Ellipse cx="352" cy="258" rx="9" ry="6.5" fill={theme.accent} />
        <Path d="M338 270 q14 14 28 0" fill="none" stroke={eye} strokeWidth={6} strokeLinecap="round" />
      </G>
    </Svg>
  );
}
