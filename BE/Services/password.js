const bcrypt = require("bcrypt");

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

// A real hash of a random string, compared against when the email doesn't exist,
// so "unknown email" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", COST);

function hashPassword(plain) {
  return bcrypt.hash(plain, COST);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash || DUMMY_HASH);
}

module.exports = { hashPassword, verifyPassword };
