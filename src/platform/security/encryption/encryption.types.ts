export interface EncryptedValue {
  readonly algorithm: 'aes-256-gcm';
  readonly keyVersion: string;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
}

export interface EncryptionKey {
  readonly version: string;
  readonly key: Buffer;
}
