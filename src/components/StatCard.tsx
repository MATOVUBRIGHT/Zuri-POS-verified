import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  color?: string;
  bg?: string;
  /** When provided the card becomes a button that filters the page below it. */
  onClick?: () => void;
  active?: boolean;
  title?: string;
};

/**
 * The stat card used across Expenses, Products, Customers, Suppliers, Tracker
 * and friends. Rendered as a <button> when onClick is given so clicking a
 * number actually reveals the rows behind it; the selected card is ringed.
 */
const StatCard = ({
  label,
  value,
  sub,
  icon: Icon,
  color = "",
  bg = "",
  onClick,
  active = false,
  title,
}: StatCardProps) => {
  const body = (
    <>
      <div className={`p-2 rounded-lg ${bg} shrink-0`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`font-bold text-lg truncate ${color}`}>{value}</p>
        {sub ? <p className="text-xs text-muted-foreground truncate">{sub}</p> : null}
      </div>
    </>
  );

  if (!onClick) {
    return <div className="rounded-xl border bg-card p-4 flex items-center gap-3">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-pressed={active}
      className={`rounded-xl border bg-card p-4 flex items-center gap-3 text-left transition-colors ${
        active ? "ring-2 ring-primary bg-muted/30" : "hover:bg-muted/50"
      }`}
    >
      {body}
    </button>
  );
};

export default StatCard;
