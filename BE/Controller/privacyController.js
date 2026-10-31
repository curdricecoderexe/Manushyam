const { User } = require("../Models/User");
const { exportUserData, deleteAccount } = require("../Services/privacy");
const { verifyPassword } = require("../Services/password");
const tokens = require("../Services/tokens");
const mailer = require("../Services/mailer");
const { invalidateUser } = require("../Services/userCache");
const { istDay } = require("../Services/salesAnalytics");
const { AppError } = require("../Utils/AppError");

// "Download my data" (DPDP right to access): one JSON file with everything linked to the account.
async function downloadMyData(req, res) {
  const data = await exportUserData(req.user.id);
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="manushyam-my-data-${istDay(new Date())}.json"`);
  res.set("Cache-Control", "no-store");
  res.send(JSON.stringify(data, null, 2));
}

// "Delete my account" (DPDP right to erasure). The password is asked again so a borrowed, signed-in
// device can't erase someone's account.
async function deleteMyAccount(req, res) {
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) {
    throw AppError.badRequest("That password is incorrect.", [{ path: "password", message: "Incorrect password" }]);
  }
  const result = await deleteAccount(user._id);
  await tokens.revokeAllForUser(user._id);
  invalidateUser(user._id);
  res.clearCookie(tokens.REFRESH_COOKIE, { ...tokens.refreshCookieOptions(), maxAge: undefined });
  await mailer.sendAccountDeletedEmail({ to: result.email, anonymizedOrders: result.anonymizedOrders });
  res.json({ deleted: result.mode, anonymizedOrders: result.anonymizedOrders });
}

module.exports = { downloadMyData, deleteMyAccount };
