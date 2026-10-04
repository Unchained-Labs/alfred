import {
  randomBytes,
  scrypt as scryptCb,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { InputError } from "@/lib/errors";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export const MIN_PASSWORD_LENGTH = 10;

// 2^14 keeps the derivation around 100ms and the memory cost under Node's
// default scrypt maxmem (128 * N * r bytes = 16 MiB here), so no tuning is
// needed at the call site.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  // Parameters travel with the hash so they can be raised later without
  // invalidating everyone's password.
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;

  let derived: Buffer;
  try {
    derived = (await scrypt(password, Buffer.from(salt, "base64"), KEY_LEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })) as Buffer;
  } catch {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "base64");
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

export function assertPasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new InputError(
      `Use at least ${MIN_PASSWORD_LENGTH} characters. Length matters more than symbols.`,
    );
  }
}
