// Creates (or resets) local test accounts: `npm run seed:dev-users`. Development only — refuses to
// run in production. Re-running resets each account's password, role and any lockout.
//
// Test logins (local dev only; sign-in codes arrive in Mailpit at http://localhost:8025):
//   admin     admin@example.com     Admin@12345
//   staff     staff@example.com     Staff@12345
//   customer  customer@example.com  Customer@12345
require("dotenv").config();

const { loadEnv } = require("../Config/env");
const { connectDB, disconnectDB } = require("../Config/db");
const { User } = require("../Models/User");
const { Address } = require("../Models/Address");
const { hashPassword } = require("../Services/password");
const { logger } = require("../Utils/logger");

const ACCOUNTS = [
  { role: "admin", name: "Asha Admin", email: "admin@example.com", password: "Admin@12345", phone: "9876500001" },
  { role: "staff", name: "Sunil Staff", email: "staff@example.com", password: "Staff@12345", phone: "9876500002" },
  { role: "customer", name: "Chitra Customer", email: "customer@example.com", password: "Customer@12345", phone: "9876500003" },
];

async function main() {
  const env = loadEnv();
  if (env.isProd) throw new Error("seed:dev-users is for local development only");
  await connectDB(env.MONGODB_URI);

  for (const a of ACCOUNTS) {
    const user = await User.findOneAndUpdate(
      { email: a.email },
      {
        $set: { name: a.name, role: a.role, phone: a.phone, passwordHash: await hashPassword(a.password), isActive: true, emailVerifiedAt: new Date(), failedLoginCount: 0 },
        $unset: { lockUntil: "", deletedAt: "" },
        // Bumping the token version signs out any old sessions for this account.
        $inc: { tokenVersion: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // Give the customer a saved address so checkout works straight away.
    if (a.role === "customer" && !(await Address.exists({ user: user._id }))) {
      await Address.create({ user: user._id, label: "Home", fullName: a.name, phone: a.phone, line1: "12 MG Road", line2: "Ashok Nagar", city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: true });
    }
    logger.info({ role: a.role, email: a.email }, "Dev account ready");
  }
  await disconnectDB();
}

main().catch(async (err) => {
  logger.fatal({ err: err.message }, "Dev user seed failed");
  await disconnectDB().catch(() => {});
  process.exit(1);
});
