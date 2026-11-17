// Client-Side Zero-Knowledge Encryption (E2EE) using Web Crypto API
const ShelfieCrypto = (function () {
  const MAGIC_HEADER = new Uint8Array([83, 72, 69, 76, 70, 73, 69, 95, 69, 50, 69, 69]); // "SHELFIE_E2EE"
  const SALT_LENGTH = 16;
  const IV_LENGTH = 12;
  const ITERATIONS = 100000;

  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptBlob(fileOrBlob, passphrase) {
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(passphrase, salt);

    const plaintextBuffer = await fileOrBlob.arrayBuffer();
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintextBuffer
    );

    // Combine: [MAGIC_HEADER 12B] + [SALT 16B] + [IV 12B] + [CIPHERTEXT]
    const combined = new Uint8Array(MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
    combined.set(MAGIC_HEADER, 0);
    combined.set(salt, MAGIC_HEADER.length);
    combined.set(iv, MAGIC_HEADER.length + SALT_LENGTH);
    combined.set(new Uint8Array(ciphertext), MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH);

    return new Blob([combined], { type: 'application/octet-stream' });
  }

  async function decryptBlob(encryptedBlob, passphrase, originalMimeType = 'application/octet-stream') {
    const buffer = await encryptedBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Validate Header
    if (bytes.length < MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH) {
      throw new Error('Invalid file format: file too small for encrypted payload.');
    }

    for (let i = 0; i < MAGIC_HEADER.length; i++) {
      if (bytes[i] !== MAGIC_HEADER[i]) {
        throw new Error('File does not have a valid E2EE encryption signature.');
      }
    }

    const saltOffset = MAGIC_HEADER.length;
    const ivOffset = saltOffset + SALT_LENGTH;
    const dataOffset = ivOffset + IV_LENGTH;

    const salt = bytes.slice(saltOffset, ivOffset);
    const iv = bytes.slice(ivOffset, dataOffset);
    const ciphertext = bytes.slice(dataOffset);

    const key = await deriveKey(passphrase, salt);

    try {
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );
      return new Blob([decryptedBuffer], { type: originalMimeType });
    } catch (e) {
      throw new Error('Decryption failed. Incorrect passkey or corrupted data.');
    }
  }

  function isEncrypted(blobOrBytes) {
    if (blobOrBytes instanceof Uint8Array && blobOrBytes.length >= MAGIC_HEADER.length) {
      for (let i = 0; i < MAGIC_HEADER.length; i++) {
        if (blobOrBytes[i] !== MAGIC_HEADER[i]) return false;
      }
      return true;
    }
    return false;
  }

  return {
    encryptBlob,
    decryptBlob,
    isEncrypted
  };
})();
