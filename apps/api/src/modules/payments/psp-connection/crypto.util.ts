import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypts plaintext using AES-256-GCM with a platform key.
 * Generates a random IV per call for semantic security.
 *
 * Storage format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
 *
 * @param plaintext - The data to encrypt (typically JSON-stringified credentials)
 * @param keyHex - The 32-byte platform encryption key, hex-encoded (64 hex chars)
 * @returns Encrypted string in the format `iv:authTag:ciphertext`
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== 32) {
    throw new Error('PSP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypts a value previously encrypted with `encrypt()`.
 * Expects the format `iv_hex:authTag_hex:ciphertext_hex`.
 *
 * @param encrypted - The encrypted string from the database
 * @param keyHex - The 32-byte platform encryption key, hex-encoded (64 hex chars)
 * @returns The original plaintext
 * @throws If decryption fails (wrong key, tampered data, or malformed input)
 */
export function decrypt(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== 32) {
    throw new Error('PSP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted credential: expected format iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted credential');
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length in encrypted credential');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
