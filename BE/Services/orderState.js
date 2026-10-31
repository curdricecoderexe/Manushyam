const { AppError } = require("../Utils/AppError");

// Every allowed move. Anything not listed is rejected, whoever asks.
const TRANSITIONS = {
  payment_pending: ["paid", "cancelled"],
  cod_pending_confirmation: ["cod_confirmed", "cancelled"],
  paid: ["processing", "packed", "cancelled"],
  cod_confirmed: ["processing", "packed", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "rto", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "rto"],
  out_for_delivery: ["delivered", "rto"],
  delivered: ["refunded"],
  rto: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

// Courier progress only ever moves forward along this line.
const SHIPPING_LINE = ["packed", "shipped", "out_for_delivery", "delivered"];

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new AppError(409, "INVALID_TRANSITION", `An order that is ${from.replace(/_/g, " ")} can’t be moved to ${to.replace(/_/g, " ")}.`);
  }
}

module.exports = { TRANSITIONS, SHIPPING_LINE, canTransition, assertTransition };
