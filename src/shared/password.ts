// Cryptographically secure password generation

export function generateStrongPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*_+-=";
  const all = upper + lower + digits + special;
  const len = 16;

  // Cryptographically secure pick (Math.random is not safe for passwords)
  const securePick = (set: string): string => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };

  const pass = [upper, lower, digits, special].map(securePick);
  for (let i = 4; i < len; i++) pass.push(securePick(all));

  // Fisher-Yates shuffle
  for (let i = pass.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [pass[i], pass[j]] = [pass[j], pass[i]];
  }

  return pass.join("");
}
