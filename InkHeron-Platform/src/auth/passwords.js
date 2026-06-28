import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a readable temporary password for teacher reset.
 * Uses lowercase letters and digits; avoids ambiguous characters.
 */
export function generateTempPassword(length = 12) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }
  return password;
}
