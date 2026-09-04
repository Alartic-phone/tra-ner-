//! Primitives cryptographiques ALARTIC — uniquement crates whitelistées CDC §5.
//!
//! - `email_hash(email)` : HMAC-SHA256 déterministe pour recherche (`users.email_hash`).
//! - `encrypt_string(email)` / `decrypt_string(blob)` : AES-256-GCM applicatif sur
//!   le clair (`users.encrypt_stringed`). Sortie = `nonce(12) || ciphertext || tag(16)`.
//! - `hash_token(bytes)` : SHA-256 d'un jeton magic link.
//! - `generate_token()` : 32 octets cryptographiques + encodage URL-safe base64.
//! - `constant_time_eq` : comparaison anti-timing pour l'audit CDC §10.2.

use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, KeyInit},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("invalid key length: expected {expected} bytes, got {got}")]
    InvalidKeyLength { expected: usize, got: usize },
    #[error("invalid ciphertext format")]
    InvalidCiphertext,
    #[error("AES-GCM operation failed")]
    AesGcm,
    #[error("invalid hex key in environment: {0}")]
    InvalidHexKey(#[from] hex::FromHexError),
}

pub const KEY_LEN: usize = 32; // 256 bits — partagé HMAC + AES-256
pub const NONCE_LEN: usize = 12; // 96 bits, recommandé pour AES-GCM
pub const TAG_LEN: usize = 16; // 128 bits, fixé par AES-GCM
pub const TOKEN_LEN: usize = 32; // 256 bits d'entropie pour le magic link
pub const HASH_LEN: usize = 32; // SHA-256 output

/// Décode une clé hex (64 chars) en 32 octets. Utilisé pour parser les vars
/// d'env `ALARTIC_MASTER_KEY` et `ALARTIC_EMAIL_HMAC_KEY`.
pub fn parse_hex_key(hex_str: &str) -> Result<[u8; KEY_LEN], CryptoError> {
    let mut out = [0u8; KEY_LEN];
    hex::decode_to_slice(hex_str.trim(), &mut out)?;
    Ok(out)
}

/// HMAC-SHA256(key, email) → 32 octets. Déterministe : permet la recherche
/// d'un user par email sans le déchiffrer.
pub fn email_hash(key: &[u8; KEY_LEN], email: &str) -> [u8; HASH_LEN] {
    let mut mac =
        <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(email.to_lowercase().trim().as_bytes());
    let result = mac.finalize().into_bytes();
    result.into()
}

/// AES-256-GCM(key, plain_bytes). Format de sortie : `nonce(12) || ciphertext || tag(16)`.
/// Variante bas niveau utilisée pour les contenus binaires (pièces jointes).
pub fn encrypt_bytes(
    key: &[u8; KEY_LEN],
    plain: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plain)
        .map_err(|_| CryptoError::AesGcm)?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Inverse de `encrypt_bytes`. Vérifie le tag d'authentification.
pub fn decrypt_bytes(
    key: &[u8; KEY_LEN],
    blob: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if blob.len() < NONCE_LEN + TAG_LEN {
        return Err(CryptoError::InvalidCiphertext);
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| CryptoError::AesGcm)
}

/// AES-256-GCM sur `&str`. Wrapper UTF-8 autour de `encrypt_bytes`.
pub fn encrypt_string(key: &[u8; KEY_LEN], plain: &str) -> Result<Vec<u8>, CryptoError> {
    encrypt_bytes(key, plain.as_bytes())
}

/// Inverse de `encrypt_string`. UTF-8 invalide → `InvalidCiphertext`.
pub fn decrypt_string(key: &[u8; KEY_LEN], blob: &[u8]) -> Result<String, CryptoError> {
    let bytes = decrypt_bytes(key, blob)?;
    String::from_utf8(bytes).map_err(|_| CryptoError::InvalidCiphertext)
}

/// Génère un jeton magic link : 32 octets cryptographiques + base64 URL-safe.
/// Le tuple retourne `(token_clair_pour_url, hash_à_stocker)`.
pub fn generate_token() -> (String, [u8; HASH_LEN]) {
    let mut raw = [0u8; TOKEN_LEN];
    OsRng.fill_bytes(&mut raw);
    let token = URL_SAFE_NO_PAD.encode(raw);
    let hash = hash_token(&raw);
    (token, hash)
}

/// Hash un jeton magic link (les bytes décodés du base64) avec SHA-256.
/// C'est ce hash qui est comparé en base, JAMAIS le jeton clair.
pub fn hash_token(token_bytes: &[u8]) -> [u8; HASH_LEN] {
    let mut hasher = Sha256::new();
    hasher.update(token_bytes);
    hasher.finalize().into()
}

/// Décode un jeton magic link reçu en URL (base64 URL-safe sans padding).
pub fn decode_token(token_str: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(token_str.as_bytes()).ok()
}

/// Comparaison à temps constant — anti timing attack (CDC §10.2).
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.ct_eq(b).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; KEY_LEN] {
        [0x42u8; KEY_LEN]
    }

    #[test]
    fn email_hash_is_deterministic_and_case_normalized() {
        let k = test_key();
        let h1 = email_hash(&k, "  ALICE@example.com  ");
        let h2 = email_hash(&k, "alice@example.com");
        assert_eq!(h1, h2, "trim + lowercase must produce the same hash");
        let h3 = email_hash(&k, "bob@example.com");
        assert_ne!(h1, h3);
    }

    #[test]
    fn aes_gcm_roundtrip() {
        let k = test_key();
        let blob = encrypt_string(&k, "alice@example.com").unwrap();
        assert!(blob.len() >= NONCE_LEN + TAG_LEN);
        let plain = decrypt_string(&k, &blob).unwrap();
        assert_eq!(plain, "alice@example.com");
    }

    #[test]
    fn aes_gcm_uses_fresh_nonce_each_call() {
        let k = test_key();
        let b1 = encrypt_string(&k, "x@y.z").unwrap();
        let b2 = encrypt_string(&k, "x@y.z").unwrap();
        assert_ne!(b1, b2, "same plaintext encrypted twice must differ (nonce)");
    }

    #[test]
    fn aes_gcm_rejects_tampered_ciphertext() {
        let k = test_key();
        let mut blob = encrypt_string(&k, "alice@example.com").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0x01; // flip un bit du tag
        assert!(decrypt_string(&k, &blob).is_err());
    }

    #[test]
    fn token_roundtrip_through_url_encoding() {
        let (token_str, hash_a) = generate_token();
        let raw = decode_token(&token_str).expect("valid base64");
        let hash_b = hash_token(&raw);
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn constant_time_eq_works() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }

    #[test]
    fn parse_hex_key_round_trip() {
        let key = parse_hex_key(
            "1cdb65c517cdb9510f6bec991a1a209e5ccdd19018cce074c5c9db09e371d80a",
        )
        .unwrap();
        assert_eq!(key.len(), 32);
    }
}
