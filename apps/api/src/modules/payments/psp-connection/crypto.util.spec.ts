import { encrypt, decrypt } from './crypto.util';
import { randomBytes } from 'crypto';

describe('crypto.util', () => {
  // Valid 32-byte key (64 hex characters)
  const validKey = 'a'.repeat(64);

  describe('encrypt', () => {
    it('should produce a string in the format iv:authTag:ciphertext', () => {
      const result = encrypt('hello world', validKey);
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      // IV is 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext is non-empty hex
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const result1 = encrypt('same content', validKey);
      const result2 = encrypt('same content', validKey);
      expect(result1).not.toEqual(result2);
    });

    it('should throw if key is not 32 bytes', () => {
      const shortKey = 'ab'.repeat(16); // 16 bytes = 32 hex chars (too short)
      expect(() => encrypt('test', shortKey)).toThrow(
        'PSP_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)',
      );
    });
  });

  describe('decrypt', () => {
    it('should return the original plaintext after encrypt → decrypt round-trip', () => {
      const plaintext = '{"secretKey":"sk_test_123","webhookSecret":"whsec_456"}';
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should work with complex JSON credentials', () => {
      const credentials = JSON.stringify({
        secretKey: 'sk_live_abcdef123456789',
        publishableKey: 'pk_live_xyz',
        webhookSecret: 'whsec_longstring_here',
      });
      const encrypted = encrypt(credentials, validKey);
      const decrypted = decrypt(encrypted, validKey);
      expect(decrypted).toBe(credentials);
    });

    it('should throw if encryption key is different from decryption key', () => {
      const otherKey = 'b'.repeat(64);
      const encrypted = encrypt('secret', validKey);
      expect(() => decrypt(encrypted, otherKey)).toThrow();
    });

    it('should throw if encrypted data is tampered with', () => {
      const encrypted = encrypt('secret data', validKey);
      const parts = encrypted.split(':');
      // Tamper with ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${'ff'.repeat(parts[2].length / 2)}`;
      expect(() => decrypt(tampered, validKey)).toThrow();
    });

    it('should throw if format is malformed (not 3 parts)', () => {
      expect(() => decrypt('only-one-part', validKey)).toThrow(
        'Malformed encrypted credential',
      );
      expect(() => decrypt('two:parts', validKey)).toThrow(
        'Malformed encrypted credential',
      );
    });

    it('should handle empty plaintext', () => {
      const encrypted = encrypt('', validKey);
      const decrypted = decrypt(encrypted, validKey);
      expect(decrypted).toBe('');
    });

    it('should handle unicode content', () => {
      const plaintext = '{"key":"value with émojis 🔑 and spëcial chars"}';
      const encrypted = encrypt(plaintext, validKey);
      const decrypted = decrypt(encrypted, validKey);
      expect(decrypted).toBe(plaintext);
    });
  });
});
