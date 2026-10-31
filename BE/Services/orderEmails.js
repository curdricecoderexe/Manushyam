const { sendMail, escapeHtml } = require("./mailer");
const { enqueue } = require("./mailQueue");
const { buildInvoicePdf } = require("./invoice");
const { getEnv } = require("../Config/runtime");

const inr = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function orderUrl(order) {
  return `${getEnv().APP_URL}/account/orders/${encodeURIComponent(order.orderNumber)}`;
}

// Table-based item rows + totals (inline styles only, for Gmail/Outlook).
function summaryHtml(order) {
  const rows = order.items
    .map(
      (i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #EFE3D2">${escapeHtml(i.name)}<br><span style="color:#7A6C60;font-size:13px">${escapeHtml(i.variantLabel ?? "")} × ${i.qty}</span></td>
<td align="right" style="padding:6px 0;border-bottom:1px solid #EFE3D2">${inr(i.lineTotal)}</td></tr>`
    )
    .join("");
  const a = order.amounts;
  const line = (label, value, strong) => `<tr><td style="padding:4px 0;${strong ? "font-weight:bold;color:#2A1608" : ""}">${label}</td><td align="right" style="padding:4px 0;${strong ? "font-weight:bold;color:#2A1608" : ""}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">${rows}
${line("Subtotal", inr(a.subtotal))}${a.discount ? line(`Discount${order.coupon?.code ? ` (${escapeHtml(order.coupon.code)})` : ""}`, `− ${inr(a.discount)}`) : ""}
${line("Shipping", a.shipping ? inr(a.shipping) : "Free")}${a.codFee ? line("COD fee", inr(a.codFee)) : ""}${line("Total", inr(a.total), true)}</table>`;
}

const button = (href, label) =>
  `<p style="margin:20px 0 0"><a href="${href}" style="display:inline-block;background:#8E5A1C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;letter-spacing:1px;text-transform:uppercase">${label}</a></p>`;

function send(order, { subject, heading, lead, extraHtml = "", attachments, purpose }) {
  enqueue(`order-${purpose}`, async () => {
    const files = typeof attachments === "function" ? await attachments() : attachments;
    await sendMail({
      to: order.email,
      subject,
      heading,
      bodyHtml: `<p style="margin:0">${lead}</p>${extraHtml}${summaryHtml(order)}${button(orderUrl(order), "View your order")}`,
      text: `${lead}\n\nOrder ${order.orderNumber} — total ${inr(order.amounts.total)}\n${orderUrl(order)}`,
      attachments: files,
      meta: { purpose: `order-${purpose}`, orderNumber: order.orderNumber },
    });
  });
}

const greet = (order) => `Hi ${escapeHtml((order.customerName || order.address?.fullName || "there").split(" ")[0])},`;

function orderConfirmed(order) {
  const how = order.paymentMethod === "cod" ? "Your Cash on Delivery order is confirmed" : "We’ve received your payment";
  send(order, {
    purpose: "confirmed",
    subject: `Order ${order.orderNumber} confirmed`,
    heading: "Thank you for your order",
    lead: `${greet(order)} ${how}. We’ll email you again as soon as it ships.`,
  });
}

function orderShipped(order) {
  const s = order.shipment ?? {};
  const track = s.trackingUrl ? button(s.trackingUrl, "Track your parcel") : "";
  send(order, {
    purpose: "shipped",
    subject: `Order ${order.orderNumber} has shipped`,
    heading: "Your ritual is on its way",
    lead: `${greet(order)} your order has shipped${s.courier ? ` with ${escapeHtml(s.courier)}` : ""}${s.awb ? ` (AWB ${escapeHtml(s.awb)})` : ""}.`,
    extraHtml: track,
  });
}

function orderDelivered(order) {
  send(order, {
    purpose: "delivered",
    subject: `Order ${order.orderNumber} delivered`,
    heading: "Delivered",
    lead: `${greet(order)} your order has been delivered. Your GST invoice is attached. Apply as directed and let us know how your ritual goes.`,
    attachments: order.invoiceNumber ? async () => [{ filename: `ManushyaM-invoice-${order.orderNumber}.pdf`, content: await buildInvoicePdf(order), contentType: "application/pdf" }] : undefined,
  });
}

function orderCancelled(order) {
  const refundNote = order.payment?.capturedAt ? " Your payment will be refunded to the original method within 5–7 working days." : "";
  send(order, {
    purpose: "cancelled",
    subject: `Order ${order.orderNumber} cancelled`,
    heading: "Your order was cancelled",
    lead: `${greet(order)} order ${escapeHtml(order.orderNumber)} has been cancelled${order.cancelReason ? ` (${escapeHtml(order.cancelReason)})` : ""}.${refundNote}`,
  });
}

function orderRefunded(order) {
  send(order, {
    purpose: "refunded",
    subject: `Refund for order ${order.orderNumber}`,
    heading: "Your refund is on its way",
    lead: `${greet(order)} we’ve refunded ${inr(order.refund?.amount ?? order.amounts.total)} for order ${escapeHtml(order.orderNumber)}. It can take 5–7 working days to reach your account.`,
  });
}

module.exports = { orderConfirmed, orderShipped, orderDelivered, orderCancelled, orderRefunded };
