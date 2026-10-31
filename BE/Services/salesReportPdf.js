const PDFDocument = require("pdfkit");

// pdfkit's built-in fonts have no ₹ glyph, so amounts print as "Rs." (as on the GST invoice).
const inr = (paise) => `Rs. ${Math.round(paise / 100).toLocaleString("en-IN")}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const change = (now, before) => (before ? `${now >= before ? "+" : ""}${(((now - before) / before) * 100).toFixed(1)}% vs previous` : "—");

const brown = "#2A1608";
const muted = "#7A6C60";
const rule = "#E6D5BD";

function table(doc, { columns, rows }) {
  const x0 = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = columns.map((c) => c.width * width);
  const drawRow = (cells, { bold = false } = {}) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    const y = doc.y;
    let x = x0;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(bold ? muted : brown);
    cells.forEach((cell, i) => {
      doc.text(String(cell ?? ""), x + 2, y, { width: widths[i] - 4, align: columns[i].align ?? "left", lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.moveTo(x0, y + 14).lineTo(x0 + width, y + 14).strokeColor(rule).lineWidth(0.5).stroke();
    doc.y = y + 18;
  };
  drawRow(columns.map((c) => c.label), { bold: true });
  rows.forEach((r) => drawRow(r));
  doc.moveDown(0.8);
}

function heading(doc, text) {
  doc.x = doc.page.margins.left;
  doc.font("Times-Bold").fontSize(14).fillColor(brown).text(text);
  doc.moveDown(0.4);
}

// A one-file summary of the sales report for sharing (A4, text and tables only).
function buildSalesPdf(report) {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Sales report ${report.range.from} to ${report.range.to}`, Author: "ManushyaM" } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { kpis, previous, range } = report;
  doc.font("Times-Bold").fontSize(22).fillColor(brown).text("ManushyaM · Sales report");
  doc.font("Helvetica").fontSize(10).fillColor(muted).text(`${range.from} to ${range.to} (India time) · compared with ${range.previous.from} to ${range.previous.to}`);
  doc.text(`Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
  doc.moveDown(1);

  heading(doc, "Summary");
  table(doc, {
    columns: [
      { label: "Measure", width: 0.4 },
      { label: "This period", width: 0.3, align: "right" },
      { label: "Change", width: 0.3, align: "right" },
    ],
    rows: [
      ["Net revenue", inr(kpis.revenue), change(kpis.revenue, previous.revenue)],
      ["Confirmed orders", kpis.orders, change(kpis.orders, previous.orders)],
      ["Average order value", inr(kpis.aov), change(kpis.aov, previous.aov)],
      ["Customers", kpis.customers, change(kpis.customers, previous.customers)],
      ["Units sold", kpis.units, ""],
      ["Cancelled orders", kpis.cancelled, ""],
      ["Refunded", inr(kpis.refunds), ""],
      ["RTO rate", pct(report.rto.rate), `${report.rto.rto} of ${report.rto.rto + report.rto.delivered} completed`],
    ],
  });

  heading(doc, "Customers and payments");
  table(doc, {
    columns: [
      { label: "Group", width: 0.34 },
      { label: "Customers / orders", width: 0.33, align: "right" },
      { label: "Revenue", width: 0.33, align: "right" },
    ],
    rows: [
      ["New customers", `${report.customers.new.customers} / ${report.customers.new.orders}`, inr(report.customers.new.revenue)],
      ["Returning customers", `${report.customers.returning.customers} / ${report.customers.returning.orders}`, inr(report.customers.returning.revenue)],
      ...report.payments.map((p) => [p.method === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)", `— / ${p.orders}`, inr(p.revenue)]),
    ],
  });

  heading(doc, "Top products");
  table(doc, {
    columns: [
      { label: "Product", width: 0.46 },
      { label: "SKU", width: 0.24 },
      { label: "Units", width: 0.1, align: "right" },
      { label: "Revenue", width: 0.2, align: "right" },
    ],
    rows: report.topProducts.length ? report.topProducts.map((p) => [p.variant ? `${p.name} · ${p.variant}` : p.name, p.sku, p.qty, inr(p.revenue)]) : [["No sales in this period", "", "", ""]],
  });

  heading(doc, report.range.granularity === "day" ? "By day" : "By month");
  table(doc, {
    columns: [
      { label: report.range.granularity === "day" ? "Day" : "Month", width: 0.4 },
      { label: "Orders", width: 0.3, align: "right" },
      { label: "Net revenue", width: 0.3, align: "right" },
    ],
    rows: report.trend.map((t) => [t.key, t.orders, inr(t.revenue)]),
  });

  doc.end();
  return done;
}

module.exports = { buildSalesPdf };
