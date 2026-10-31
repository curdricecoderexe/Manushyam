const PDFDocument = require("pdfkit");
const { getEnv } = require("../Config/runtime");
const { Counter } = require("../Models/Order");

// Indian financial year (April–March), e.g. 2026-10-04 → "26-27".
function financialYear(date = new Date()) {
  const y = date.getFullYear() - (date.getMonth() < 3 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

// Sequential GST invoice number per financial year: MM/26-27/000001.
async function nextInvoiceNumber(session, date = new Date()) {
  const fy = financialYear(date);
  const counter = await Counter.findOneAndUpdate({ _id: `invoice-${fy}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return `MM/${fy}/${String(counter.seq).padStart(6, "0")}`;
}

// Prices are GST-inclusive. Splits an inclusive amount into taxable value + tax (paise).
function splitTax(inclusive, ratePercent) {
  const taxable = Math.round((inclusive * 100) / (100 + ratePercent));
  return { taxable, tax: inclusive - taxable };
}

// Same-state supply → CGST + SGST; inter-state → IGST.
function taxSummary(order, env = getEnv()) {
  const rate = env.GST_RATE_PERCENT;
  const { taxable, tax } = splitTax(order.amounts.total, rate);
  const intra = String(order.address?.state ?? "").toLowerCase() === env.INVOICE_STATE.toLowerCase();
  return intra
    ? { rate, taxable, tax, lines: [{ label: `CGST @ ${rate / 2}%`, amount: Math.floor(tax / 2) }, { label: `SGST @ ${rate / 2}%`, amount: tax - Math.floor(tax / 2) }] }
    : { rate, taxable, tax, lines: [{ label: `IGST @ ${rate}%`, amount: tax }] };
}

const inr = (paise) => `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildInvoicePdf(order) {
  const env = getEnv();
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Invoice ${order.invoiceNumber}`, Author: env.INVOICE_LEGAL_NAME } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const brown = "#2A1608";
  const muted = "#7A6C60";
  doc.fillColor(brown).font("Times-Bold").fontSize(24).text("ManushyaM", 48, 48);
  doc.font("Helvetica").fontSize(9).fillColor(muted).text(env.INVOICE_LEGAL_NAME).text(env.INVOICE_ADDRESS);
  if (env.INVOICE_GSTIN) doc.text(`GSTIN: ${env.INVOICE_GSTIN}`);
  doc.fillColor(brown).font("Helvetica-Bold").fontSize(14).text("TAX INVOICE", 350, 52, { width: 197, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(muted)
    .text(`Invoice no: ${order.invoiceNumber}`, 350, 72, { width: 197, align: "right" })
    .text(`Invoice date: ${new Date(order.invoiceDate ?? order.createdAt).toLocaleDateString("en-IN")}`, { width: 197, align: "right" })
    .text(`Order: ${order.orderNumber}`, { width: 197, align: "right" })
    .text(`Payment: ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)"}`, { width: 197, align: "right" });

  const a = order.address;
  doc.moveDown(2).fillColor(brown).font("Helvetica-Bold").fontSize(10).text("Bill / Ship to", 48, 150);
  doc
    .font("Helvetica")
    .fillColor("#4A3F36")
    .text(a.fullName)
    .text([a.line1, a.line2, a.landmark].filter(Boolean).join(", "))
    .text(`${a.city}, ${a.state} ${a.pincode}`)
    .text(`Phone: ${a.phone}`)
    .text(`Place of supply: ${a.state}`);

  // Items table
  let y = 250;
  const cols = [48, 300, 350, 440];
  doc.font("Helvetica-Bold").fontSize(9).fillColor(brown);
  doc.text("Item", cols[0], y).text("Qty", cols[1], y).text("Unit price", cols[2], y).text("Amount", cols[3], y, { width: 107, align: "right" });
  doc.moveTo(48, y + 14).lineTo(547, y + 14).strokeColor("#E6D5BD").stroke();
  y += 22;
  doc.font("Helvetica").fillColor("#4A3F36");
  for (const i of order.items) {
    doc.text(`${i.name}${i.variantLabel ? ` — ${i.variantLabel}` : ""}`, cols[0], y, { width: 240 });
    const rowH = Math.max(14, doc.heightOfString(`${i.name} — ${i.variantLabel ?? ""}`, { width: 240 }));
    doc.text(String(i.qty), cols[1], y).text(inr(i.price), cols[2], y).text(inr(i.lineTotal), cols[3], y, { width: 107, align: "right" });
    y += rowH + 8;
  }
  doc.moveTo(48, y).lineTo(547, y).strokeColor("#E6D5BD").stroke();
  y += 10;

  const row = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? brown : "#4A3F36");
    doc.text(label, 300, y, { width: 140 }).text(value, cols[3], y, { width: 107, align: "right" });
    y += 16;
  };
  const amt = order.amounts;
  row("Subtotal", inr(amt.subtotal));
  if (amt.discount) row(`Discount${order.coupon?.code ? ` (${order.coupon.code})` : ""}`, `- ${inr(amt.discount)}`);
  row("Shipping", amt.shipping ? inr(amt.shipping) : "Free");
  if (amt.codFee) row("COD fee", inr(amt.codFee));
  row("Total (incl. GST)", inr(amt.total), true);

  const tax = taxSummary(order, env);
  y += 10;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(brown).text("Tax summary (included in the total above)", 48, y);
  y += 16;
  doc.font("Helvetica").fillColor("#4A3F36").text(`Taxable value`, 48, y).text(inr(tax.taxable), 200, y);
  for (const l of tax.lines) {
    y += 14;
    doc.text(l.label, 48, y).text(inr(l.amount), 200, y);
  }

  doc
    .fontSize(8)
    .fillColor(muted)
    .text("This is a computer-generated invoice and does not need a signature. Questions? care@manushyam.com", 48, 760, { width: 499, align: "center" });
  doc.end();
  return done;
}

module.exports = { buildInvoicePdf, nextInvoiceNumber, financialYear, splitTax, taxSummary };
