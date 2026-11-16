const { BoxSize } = require("../Models/Shipping");
const { AppError } = require("../Utils/AppError");

// Used only when no box sizes have been set up yet (Admin → Box sizes).
const FALLBACK_BOX = Object.freeze({ id: null, name: "Standard carton", code: null, lengthCm: 20, breadthCm: 15, heightCm: 10, emptyWeightGrams: 0, maxWeightGrams: null, maxUnits: null, fallback: true });
const DEFAULT_ITEM_WEIGHT_GRAMS = 300;
const VOLUMETRIC_DIVISOR = 5000; // cm³ per kg, the courier industry standard Shiprocket uses

const volume = (b) => b.lengthCm * b.breadthCm * b.heightCm;
const plain = (b) => (typeof b.toPublic === "function" ? b.toPublic() : b);

function contentsOf(items) {
  return {
    units: items.reduce((n, i) => n + i.qty, 0),
    itemWeightGrams: items.reduce((g, i) => g + (i.weightGrams || DEFAULT_ITEM_WEIGHT_GRAMS) * i.qty, 0),
  };
}

const fits = (box, { units, itemWeightGrams }) => (!box.maxWeightGrams || itemWeightGrams <= box.maxWeightGrams) && (!box.maxUnits || units <= box.maxUnits);

// Smallest active box that takes the order's weight and unit count; else the default box; else the
// biggest one (staff can still pick another before booking).
function pickBox(boxes, contents) {
  const active = boxes.filter((b) => b.isActive !== false).sort((a, b) => volume(a) - volume(b));
  if (!active.length) return { box: FALLBACK_BOX, fits: true };
  const match = active.find((b) => fits(b, contents));
  if (match) return { box: match, fits: true };
  const fallback = active.find((b) => b.isDefault) ?? active[active.length - 1];
  return { box: fallback, fits: false };
}

// What gets declared to the courier for this box.
function parcel(box, contents) {
  const deadWeightGrams = contents.itemWeightGrams + (box.emptyWeightGrams || 0);
  const volumetricWeightGrams = Math.round((volume(box) / VOLUMETRIC_DIVISOR) * 1000);
  return {
    box: { id: box.id ?? (box._id ? String(box._id) : null), name: box.name, code: box.code ?? null, lengthCm: box.lengthCm, breadthCm: box.breadthCm, heightCm: box.heightCm },
    units: contents.units,
    itemWeightGrams: contents.itemWeightGrams,
    weightGrams: deadWeightGrams,
    volumetricWeightGrams,
    chargeableWeightGrams: Math.max(deadWeightGrams, volumetricWeightGrams),
  };
}

async function activeBoxes() {
  return (await BoxSize.find({ isActive: true }).sort({ name: 1 })).map(plain);
}

// Packaging for an order: the staff-chosen box (boxId) or the suggested one.
async function packagingFor(items, { boxId } = {}) {
  const contents = contentsOf(items);
  if (boxId) {
    const chosen = await BoxSize.findById(boxId);
    if (!chosen || !chosen.isActive) throw AppError.badRequest("That box size isn’t available any more.", [{ path: "boxId", message: "Unknown or inactive box" }]);
    const box = plain(chosen);
    return { ...parcel(box, contents), fits: fits(box, contents), chosen: true };
  }
  const { box, fits: ok } = pickBox(await activeBoxes(), contents);
  return { ...parcel(box, contents), fits: ok, chosen: false };
}

// For the admin order panel: every active box plus which one would be used.
async function packagingOptions(items) {
  const boxes = await activeBoxes();
  const contents = contentsOf(items);
  const { box, fits: ok } = pickBox(boxes, contents);
  return {
    boxes: boxes.map((b) => ({ ...b, fits: fits(b, contents), ...pick(parcel(b, contents), ["weightGrams", "volumetricWeightGrams", "chargeableWeightGrams"]) })),
    suggested: { ...parcel(box, contents), fits: ok },
    usingFallback: !boxes.length,
  };
}

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

module.exports = { pickBox, parcel, contentsOf, packagingFor, packagingOptions, FALLBACK_BOX, VOLUMETRIC_DIVISOR, DEFAULT_ITEM_WEIGHT_GRAMS };
