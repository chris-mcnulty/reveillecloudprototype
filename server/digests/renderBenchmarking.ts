import PDFDocument from "pdfkit";

export interface BenchmarkPdfMetric {
  key: string;
  label: string;
  helpText: string;
  windowLabel: string;
  lowerIsBetter: boolean;
}

export interface BenchmarkPdfCell {
  display: string;
  rawValue: number | null;
  delta: number | null;
}

export interface BenchmarkPdfRow {
  tenantId: string;
  tenantName: string;
  cells: Record<string, BenchmarkPdfCell>;
}

export interface BenchmarkPdfData {
  organizationName: string;
  windowLabel: string;
  generatedAt: Date;
  metrics: BenchmarkPdfMetric[];
  rows: BenchmarkPdfRow[];
}

type Quartile = "best" | "worst" | "neutral";

function quartileFor(values: number[], lowerIsBetter: boolean): (i: number) => Quartile {
  const valid = values.filter(v => Number.isFinite(v));
  if (valid.length < 3) return () => "neutral";
  const sorted = [...valid].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return (i: number) => {
    const v = values[i];
    if (!Number.isFinite(v)) return "neutral";
    if (q1 === q3) return "neutral";
    if (lowerIsBetter) {
      if (v <= q1) return "best";
      if (v >= q3) return "worst";
    } else {
      if (v >= q3) return "best";
      if (v <= q1) return "worst";
    }
    return "neutral";
  };
}

const COLORS = {
  best: { fill: "#d1fae5", border: "#10b981" },
  worst: { fill: "#fee2e2", border: "#ef4444" },
  neutral: { fill: "#ffffff", border: "#e2e8f0" },
  headerBg: "#0f172a",
  headerText: "#ffffff",
  subText: "#64748b",
  bodyText: "#0f172a",
  rule: "#e2e8f0",
  deltaUp: "#dc2626",
  deltaDown: "#059669",
  deltaFlat: "#64748b",
};

export async function renderBenchmarkingPdf(data: BenchmarkPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        layout: "landscape",
        margins: { top: 56, bottom: 56, left: 40, right: 40 },
        bufferPages: true,
        info: {
          Title: `${data.organizationName} — Cross-Tenant Benchmark`,
          Author: "Reveille",
          Subject: "Cross-Tenant Benchmarking",
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const left = doc.page.margins.left;
      const right = pageW - doc.page.margins.right;
      const contentW = right - left;

      // Pre-compute quartile classifiers per metric
      const quartiles: Record<string, (i: number) => Quartile> = {};
      for (const m of data.metrics) {
        const vals = data.rows.map(r => r.cells[m.key]?.rawValue);
        quartiles[m.key] = quartileFor(
          vals.map(v => (v == null ? NaN : v)),
          m.lowerIsBetter,
        );
      }

      const drawHeader = () => {
        doc.save();
        doc.rect(0, 0, pageW, 44).fill(COLORS.headerBg);
        doc
          .fillColor(COLORS.headerText)
          .font("Helvetica-Bold")
          .fontSize(13)
          .text(data.organizationName, left, 14, { width: contentW / 2 });
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#cbd5e1")
          .text("Cross-Tenant Benchmark", left, 28, { width: contentW / 2 });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#cbd5e1")
          .text(
            `Window: ${data.windowLabel}  ·  Generated ${data.generatedAt.toLocaleString("en-US")}`,
            left + contentW / 2,
            22,
            { width: contentW / 2, align: "right" },
          );
        doc.restore();
      };

      const drawFooter = (pageNum: number, pageTotal: number) => {
        doc.save();
        const y = pageH - 32;
        doc
          .strokeColor(COLORS.rule)
          .lineWidth(0.5)
          .moveTo(left, y)
          .lineTo(right, y)
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLORS.subText)
          .text(
            `Reveille  ·  ${data.organizationName}  ·  ${data.generatedAt.toLocaleDateString("en-US")}`,
            left,
            y + 8,
            { width: contentW / 2 },
          );
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLORS.subText)
          .text(`Page ${pageNum} of ${pageTotal}`, left + contentW / 2, y + 8, {
            width: contentW / 2,
            align: "right",
          });
        doc.restore();
      };

      // Layout: tenant column + N metric columns
      const tenantColW = 150;
      const metricColW = Math.max(70, (contentW - tenantColW) / Math.max(1, data.metrics.length));
      const headerRowH = 38;
      const bodyRowH = 30;

      let pageNum = 1;
      let y = 56;

      const drawTableHeader = () => {
        doc.save();
        doc.rect(left, y, contentW, headerRowH).fill("#f1f5f9");
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(COLORS.bodyText)
          .text("TENANT", left + 8, y + 8, { width: tenantColW - 16 });
        let x = left + tenantColW;
        for (const m of data.metrics) {
          doc
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .fillColor(COLORS.bodyText)
            .text(`${m.label} (${m.windowLabel})`, x + 4, y + 6, {
              width: metricColW - 8,
              align: "right",
              ellipsis: true,
            });
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(COLORS.subText)
            .text(m.helpText, x + 4, y + 22, {
              width: metricColW - 8,
              align: "right",
              ellipsis: true,
            });
          x += metricColW;
        }
        doc
          .strokeColor(COLORS.rule)
          .lineWidth(0.5)
          .moveTo(left, y + headerRowH)
          .lineTo(right, y + headerRowH)
          .stroke();
        doc.restore();
        y += headerRowH;
      };

      drawHeader();
      drawTableHeader();

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 56) {
          doc.addPage();
          pageNum += 1;
          y = 56;
          drawHeader();
          drawTableHeader();
        }
      };

      data.rows.forEach((row, rowIdx) => {
        ensureSpace(bodyRowH);
        // Tenant cell
        doc.save();
        doc
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .fillColor(COLORS.bodyText)
          .text(row.tenantName, left + 8, y + 6, { width: tenantColW - 16, ellipsis: true });
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.subText)
          .text(`${row.tenantId.slice(0, 8)}…`, left + 8, y + 19, { width: tenantColW - 16 });
        doc.restore();

        let x = left + tenantColW;
        for (const m of data.metrics) {
          const cell = row.cells[m.key];
          const q = quartiles[m.key](rowIdx);
          const color = COLORS[q];
          // Cell background
          doc.save();
          doc.rect(x + 2, y + 2, metricColW - 4, bodyRowH - 4).fill(color.fill);
          // Left border accent
          doc
            .rect(x + 2, y + 2, 2, bodyRowH - 4)
            .fill(color.border);
          doc.restore();

          if (cell) {
            doc
              .font("Helvetica-Bold")
              .fontSize(11)
              .fillColor(COLORS.bodyText)
              .text(cell.display, x + 4, y + 6, {
                width: metricColW - 8,
                align: "right",
              });
            const d = cell.delta;
            let deltaStr = "—";
            let deltaColor = COLORS.deltaFlat;
            if (d != null && Number.isFinite(d)) {
              const sign = d > 0 ? "▲" : d < 0 ? "▼" : "·";
              deltaStr = `${sign} ${Math.abs(d).toFixed(0)}%`;
              if (Math.abs(d) >= 1) {
                const positive = m.lowerIsBetter ? d < 0 : d > 0;
                deltaColor = positive ? COLORS.deltaDown : COLORS.deltaUp;
              }
            }
            doc
              .font("Helvetica")
              .fontSize(8)
              .fillColor(deltaColor)
              .text(deltaStr, x + 4, y + 19, {
                width: metricColW - 8,
                align: "right",
              });
          } else {
            doc
              .font("Helvetica")
              .fontSize(11)
              .fillColor(COLORS.subText)
              .text("—", x + 4, y + 10, { width: metricColW - 8, align: "right" });
          }
          x += metricColW;
        }

        // Row separator
        doc
          .strokeColor(COLORS.rule)
          .lineWidth(0.25)
          .moveTo(left, y + bodyRowH)
          .lineTo(right, y + bodyRowH)
          .stroke();
        y += bodyRowH;
      });

      // Legend
      ensureSpace(28);
      y += 6;
      doc.save();
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.subText);
      const legendY = y;
      const drawSwatch = (x: number, fill: string, border: string, label: string): number => {
        doc.rect(x, legendY, 10, 10).fill(fill);
        doc.rect(x, legendY, 2, 10).fill(border);
        doc.fillColor(COLORS.subText).text(label, x + 14, legendY + 1);
        return doc.widthOfString(label) + 30;
      };
      let lx = left;
      lx += drawSwatch(lx, COLORS.best.fill, COLORS.best.border, "Top quartile");
      lx += drawSwatch(lx, COLORS.worst.fill, COLORS.worst.border, "Bottom quartile");
      doc.fillColor(COLORS.subText).text("Δ shown vs. prior period for each metric window.", lx, legendY + 1);
      doc.restore();

      // Stamp footers on every page now that we know the total count.
      const range = doc.bufferedPageRange();
      const total = range.count;
      for (let i = 0; i < total; i++) {
        doc.switchToPage(range.start + i);
        drawFooter(i + 1, total);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
