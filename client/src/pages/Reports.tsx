import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileText, Loader2, ChevronRight, CheckCircle2 } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";

const REPORT_TYPES = [
  { value: "sla",          label: "SLA & Availability (metrics)" },
  { value: "latency",      label: "Detailed Latency Breakdown (metrics)" },
  { value: "errors",       label: "Error & Incident Log (failed test runs)" },
  { value: "audit",        label: "SharePoint Audit Trail" },
  { value: "spe-access",   label: "SPE Content Access Events" },
  { value: "spe-security", label: "SPE Security Events" },
];

const TIME_RANGES = [
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d",  label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

export default function Reports() {
  const { activeTenantId } = useActiveTenant();
  const { toast } = useToast();
  const [reportType, setReportType] = useState("sla");
  const [range, setRange] = useState("7d");
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  async function handleExportCsv() {
    if (!activeTenantId) {
      toast({ title: "No tenant selected", description: "Select a tenant before exporting.", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams({ tenantId: activeTenantId, reportType, range });
      const res = await fetch(`/api/reports/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `report-${reportType}-${range}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const typeName = REPORT_TYPES.find(r => r.value === reportType)?.label || reportType;
      setLastExport(`${typeName} (${range})`);
      toast({ title: "Export complete", description: `Downloaded ${filename}` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports & Analytics</h2>
          <p className="text-muted-foreground">
            Generate on-demand performance summaries or configure scheduled exports.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Generate On-Demand Report</CardTitle>
            <CardDescription>Export current data for the selected tenant as CSV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Time Range</label>
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!activeTenantId && (
              <p className="text-sm text-muted-foreground">Select a tenant to enable export.</p>
            )}

            {lastExport && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Last export: {lastExport}
              </div>
            )}

            <div className="flex gap-4">
              <Button className="flex-1" variant="outline" disabled>
                <FileText className="mr-2 h-4 w-4" /> Generate PDF
                <span className="ml-2 text-xs text-muted-foreground">(coming soon)</span>
              </Button>
              <Button
                className="flex-1"
                onClick={handleExportCsv}
                disabled={exporting || !activeTenantId}
              >
                {exporting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting…</>
                  : <><FileDown className="mr-2 h-4 w-4" /> Export CSV</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-primary" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
              Power BI Integration
            </CardTitle>
            <CardDescription>Connect directly to the analytics store</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Use our official Power BI Data Connector to build custom, interactive dashboards directly against your historical telemetry.
            </p>
            <Button variant="secondary" className="w-full" disabled>
              Get Connection String <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">Coming in a future release</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Available CSV Report Types</CardTitle>
            <CardDescription>All exports include headers and are compatible with Excel, Power BI Desktop, and Splunk</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {REPORT_TYPES.map(r => (
                <div key={r.value} className="border rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.value === "sla" && "Metric name, value, unit, status, timestamp per test run"}
                    {r.value === "latency" && "Full latency breakdown per metric measurement"}
                    {r.value === "errors" && "Failed test runs with error messages and duration"}
                    {r.value === "audit" && "SharePoint audit operations, user, site URL, IP"}
                    {r.value === "spe-access" && "SPE container access events with content type and sensitivity"}
                    {r.value === "spe-security" && "SPE security events with severity and container context"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
