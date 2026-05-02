import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { useUrlWindow } from "@/lib/use-url-window";

export function WindowFilterBadge() {
  const { label } = useUrlWindow();
  if (!label) return null;
  return (
    <Badge variant="secondary" className="gap-1" data-testid="badge-window-filter">
      <Clock className="h-3 w-3" />
      {label}
    </Badge>
  );
}
