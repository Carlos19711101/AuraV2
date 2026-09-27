import nacl from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';

// ✅ Genera un par de claves para ECDH (X25519)
export function generateKeyPair() {
  return nacl.box.keyPair();
}

// ✅ Deriva la clave compartida entre dos usuarios
export function deriveSharedKey(theirPublicKey: Uint8Array, mySecretKey: Uint8Array) {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

// ✅ Cifra un mensaje usando la clave compartida
export function encryptMessage(message: string, sharedKey: Uint8Array) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = decodeUTF8(message);
  const encrypted = nacl.box.after(messageUint8, nonce, sharedKey);

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

// ✅ Descifra un mensaje
export function decryptMessage(
  ciphertextBase64: string,
  nonceBase64: string,
  sharedKey: Uint8Array
): string | null {
  try {
    const ciphertext = decodeBase64(ciphertextBase64);
    const nonce = decodeBase64(nonceBase64);
    const decrypted = nacl.box.open.after(ciphertext, nonce, sharedKey);

    if (!decrypted) return null;

    return encodeUTF8(decrypted);
  } catch (error) {
    console.error('Error descifrando mensaje:', error);
    return null;
  }
}

// ✅ Almacena las claves de forma segura (usando SecureStore)
export async function getOrCreateSessionKeys(sessionId: string) {
  const keyName = `aura_session_keys_${sessionId}`;

  // Por ahora usamos una clave derivada del session_id + un secreto local
  // En producción, usar SecureStore para guardar las claves privadas
  return null; // Placeholder - lo completamos en el siguiente paso
}