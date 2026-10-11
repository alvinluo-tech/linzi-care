// 去掉易混淆字符（0/O/1/l/I）的密码字符集
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function randomIndex(max: number): number {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

/** 生成保证四类字符各至少一个的随机密码 */
export function generatePassword(length = 16): string {
  const chars = [UPPER, LOWER, DIGITS, SYMBOLS].map(
    (set) => set[randomIndex(set.length)]
  );
  for (let i = chars.length; i < length; i++) {
    chars.push(ALL[randomIndex(ALL.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
