import type { CSSProperties, FunctionComponent, SVGProps } from "react";
import { Icon } from "@shopify/polaris";
import "../styles/stat-card.css";

type Tone = "success" | "critical" | "caution" | "subdued" | "info";
type IconSource = FunctionComponent<SVGProps<SVGSVGElement>>;

export function StatCard({
  label,
  value,
  tone,
  icon,
  iconTone,
  style,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: IconSource;
  iconTone?: Tone;
  style?: CSSProperties;
}) {
  const toneClass = tone ? ` av-stat--${tone}` : "";
  const iconToneClass = iconTone ? ` av-stat__icon--${iconTone}` : "";
  return (
    <div className={`av-stat${toneClass}`} style={style}>
      <div className="av-stat__label">{label}</div>
      <div className="av-stat__row">
        <div className="av-stat__value">{value}</div>
        {icon ? (
          <span className={`av-stat__icon${iconToneClass}`}>
            <Icon source={icon} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
