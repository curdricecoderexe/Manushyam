const { PincodeRule, getDeliverySettings } = require("../Models/Delivery");
const { shiprocketConfigured, checkServiceability } = require("./shiprocket");
const { logger } = require("../Utils/logger");

const PIN_RE = /^[1-9][0-9]{5}$/;

// Exact 6-digit rule beats a 3-digit regional one.
async function findRule(pincode) {
  const rules = await PincodeRule.find({ pincode: { $in: [pincode, pincode.slice(0, 3)] }, isActive: true }).lean();
  return rules.find((r) => r.pincode === pincode) ?? rules[0] ?? null;
}

// Delivery options for a PIN and an order value (paise, after discount). The server always
// recomputes this at order time; what the browser shows is only a preview.
async function quoteDelivery({ pincode, subtotal = 0, weightGrams = 500 }) {
  const settings = await getDeliverySettings();
  const unavailable = (message) => ({ pincode, serviceable: false, codAvailable: false, methods: [], message, cod: { fee: settings.cod.fee, maxOrder: settings.cod.maxOrder } });
  if (!PIN_RE.test(String(pincode))) return unavailable("Enter a valid 6-digit PIN code.");

  const rule = await findRule(pincode);
  if (rule && !rule.serviceable) return unavailable(rule.note || "We don’t deliver to this PIN code yet.");
  if (!rule && !settings.serviceByDefault) return unavailable("We don’t deliver to this PIN code yet.");

  let courier = null;
  if (shiprocketConfigured()) {
    try {
      courier = await checkServiceability({ pincode, weightGrams });
    } catch (err) {
      // Shiprocket being down shouldn't stop checkout; fall back to our own rules.
      logger.warn({ err: err.message, pincode }, "Serviceability check failed; using store rules");
    }
    if (courier && !courier.serviceable) return unavailable("Our courier partners don’t deliver to this PIN code yet.");
  }

  const standardFee = rule?.standardFee ?? settings.standard.fee;
  const free = settings.freeShippingThreshold > 0 ? subtotal >= settings.freeShippingThreshold : standardFee === 0;
  const eta = rule?.eta?.min ? rule.eta : (courier?.etaDays ?? settings.standard.eta);
  const methods = [{ id: "standard", label: "Standard delivery", fee: free ? 0 : standardFee, etaMinDays: eta.min, etaMaxDays: Math.max(eta.min, eta.max) }];
  if (settings.express.enabled && (rule?.expressAvailable ?? true)) {
    methods.push({ id: "express", label: "Express delivery", fee: settings.express.fee, etaMinDays: settings.express.eta.min, etaMaxDays: settings.express.eta.max });
  }

  const codAvailable = Boolean(settings.cod.enabled && (rule?.codAvailable ?? true) && (courier ? courier.codAvailable : true));
  const belowMin = settings.minOrder > 0 && subtotal < settings.minOrder;
  return {
    pincode,
    serviceable: true,
    city: rule?.city ?? null,
    state: rule?.state ?? null,
    courier: courier?.courier ?? null,
    methods,
    codAvailable,
    cod: { fee: settings.cod.fee, maxOrder: settings.cod.maxOrder },
    freeShippingThreshold: settings.freeShippingThreshold,
    minOrder: settings.minOrder,
    message: belowMin ? `Minimum order value is ₹${(settings.minOrder / 100).toLocaleString("en-IN")}.` : null,
    belowMinOrder: belowMin,
  };
}

module.exports = { quoteDelivery, PIN_RE };
