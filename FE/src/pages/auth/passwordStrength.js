// Mirrors the server rule (8+ chars, a letter and a number) and adds a score for the meter.
export function passwordStrength(pw = "") {
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const valid = pw.length >= 8 && pw.length <= 128 && hasLetter && hasNumber;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (hasLetter && hasNumber) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) score += 1;
  let hint = "Use 8+ characters with a letter and a number";
  if (valid) hint = score >= 4 ? "Strong password" : score === 3 ? "Good password" : "Okay — add more length or a symbol to make it stronger";
  return { valid, score, hint };
}
