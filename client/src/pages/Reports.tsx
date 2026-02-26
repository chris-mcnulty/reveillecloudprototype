import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Calendar, FileText, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const scheduledReports = [
  { id: "r-1", name: "Weekly SLA Summary", format: "PDF", schedule: "Every Monday 09:00", recipients: 3 },
  { id: "r-2", name: "Monthly Executive Brief", format: "PDF", schedule: "1st of Month", recipients: 5 },
  { id: "r-3", name: "Raw Metric Export", format: "CSV", schedule: "Daily 00:00", recipients: 1 },
];

export default function Reports() {
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
            <CardDescription>Export current metric data for the selected tenant</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Report Type</label>
                <Select defaultValue="sla">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sla">SLA & Availability</SelectItem>
                    <SelectItem value="latency">Detailed Latency Breakdown</SelectItem>
                    <SelectItem value="errors">Error & Incident Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Time Range</label>
                <Select defaultValue="7d">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="custom">Custom Range...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4">
              <Button className="flex-1">
                <FileText className="mr-2 h-4 w-4" /> Generate PDF
              </Button>
              <Button variant="outline" className="flex-1">
                <FileDown className="mr-2 h-4 w-4" /> Export CSV
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
            <Button variant="secondary" className="w-full">
              Get Connection String <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Scheduled Exports</CardTitle>
              <CardDescription>Automated reports sent to stakeholders</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Calendar className="mr-2 h-4 w-4" /> New Schedule
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Name</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
                    <TableCell className="text-muted-foreground">{report.schedule}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium ring-1 ring-inset ring-muted-foreground/20">
                        {report.format}
                      </span>
                    </TableCell>
                    <TableCell>{report.recipients} users</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}