const emails = require("./orderEmails");
const { notify, notifyStaff } = require("./notifications");

// Everything that tells people about an order change: the email and the in-app (bell) notification.
const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const customerLink = (order) => `/account/orders/${order.orderNumber}`;

function orderConfirmed(order) {
  emails.orderConfirmed(order);
  notify(order.user, {
    type: order.paymentMethod === "cod" ? "order" : "payment",
    title: order.paymentMethod === "cod" ? "Order confirmed" : "Payment received — order confirmed",
    body: `Order ${order.orderNumber} · ${rupees(order.amounts.total)}`,
    link: customerLink(order),
  });
  notifyStaff({ type: "order", title: `New order ${order.orderNumber}`, body: `${rupees(order.amounts.total)} · ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online"} · ${order.address?.city ?? ""}`, link: `/admin/orders?q=${order.orderNumber}` });
}

function orderShipped(order) {
  emails.orderShipped(order);
  notify(order.user, { type: "order", title: "Your order has shipped", body: `Order ${order.orderNumber}${order.shipment?.courier ? ` · ${order.shipment.courier}` : ""}`, link: customerLink(order) });
}

function orderOutForDelivery(order) {
  notify(order.user, { type: "order", title: "Out for delivery today", body: `Order ${order.orderNumber} is with the delivery partner.`, link: customerLink(order) });
}

function orderDelivered(order) {
  emails.orderDelivered(order);
  notify(order.user, { type: "order", title: "Delivered — how was it?", body: `Order ${order.orderNumber} was delivered. Your GST invoice is ready, and you can review your products.`, link: customerLink(order) });
}

function orderCancelled(order) {
  emails.orderCancelled(order);
  notify(order.user, { type: "order", title: "Order cancelled", body: `Order ${order.orderNumber}${order.payment?.capturedAt ? " · your refund will follow" : ""}`, link: customerLink(order) });
  // Staff need to know when a confirmed order they may be packing is cancelled.
  notifyStaff({ type: "order", title: `Order ${order.orderNumber} cancelled`, body: order.cancelReason ?? "", link: `/admin/orders?q=${order.orderNumber}` });
}

function orderRefunded(order) {
  emails.orderRefunded(order);
  notify(order.user, { type: "refund", title: "Refund processed", body: `${rupees(order.refund?.amount ?? order.amounts.total)} for order ${order.orderNumber}`, link: customerLink(order) });
}

module.exports = { orderConfirmed, orderShipped, orderOutForDelivery, orderDelivered, orderCancelled, orderRefunded };
