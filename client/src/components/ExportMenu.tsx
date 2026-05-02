import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

interface ExportMenuProps {
  baseUrl: string;
  query?: Record<string, string | number | undefined>;
  testIdPrefix?: string;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "default" | "lg";
}

function buildHref(baseUrl: string, format: "csv" | "xlsx", query?: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set("format", format);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

export function ExportMenu({ baseUrl, query, testIdPrefix = "export", label = "Export", disabled, size = "sm" }: ExportMenuProps) {
  const trigger = (format: "csv" | "xlsx") => {
    const href = buildHref(baseUrl, format, query);
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled} data-testid={`button-${testIdPrefix}-menu`}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => trigger("csv")} data-testid={`${testIdPrefix}-csv`}>
          <FileText className="h-4 w-4 mr-2" /> Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => trigger("xlsx")} data-testid={`${testIdPrefix}-xlsx`}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Download XLSX
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
