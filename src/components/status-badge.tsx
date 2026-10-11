import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_META } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const meta = APPOINTMENT_STATUS_META[status] ?? {
    label: status,
    badge: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={meta.badge}>
      {meta.label}
    </Badge>
  );
}
