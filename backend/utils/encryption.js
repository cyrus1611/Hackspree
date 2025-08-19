const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Configuration constants
const ENCRYPTION_CONFIG = {
  ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32, // 256 bits
  IV_LENGTH: 16,  // 128 bits
  TAG_LENGTH: 16, // 128 bits
  SALT_LENGTH: 32,
  BCRYPT_ROUNDS: 12,
  HMAC_ALGORITHM: 'sha256'
};

/**
 * Generate encryption key from password and salt
 * @param {string} password - Password to derive key from
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} - Derived key
 */
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, ENCRYPTION_CONFIG.KEY_LENGTH, 'sha256');
};

/**
 * Generate random bytes
 * @param {number} length - Number of bytes to generate
 * @returns {Buffer} - Random bytes
 */
const generateRandomBytes = (length) => {
  return crypto.randomBytes(length);
};

/**
 * Generate secure random string
 * @param {number} length - Length of string
 * @param {string} charset - Character set to use
 * @returns {string} - Random string
 */
const generateSecureRandomString = (length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    result += charset[randomIndex];
  }
  return result;
};

/**
 * Generate cryptographically secure token
 * @param {number} length - Token length in bytes
 * @returns {string} - Hex encoded token
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate API key
 * @param {string} prefix - Prefix for the API key
 * @returns {string} - API key
 */
const generateApiKey = (prefix = 'clx') => {
  const randomPart = generateSecureToken(32);
  return `${prefix}_${randomPart}`;
};

/**
 * Hash string using SHA-256
 * @param {string} str - String to hash
 * @param {string} salt - Optional salt
 * @returns {string} - Hex encoded hash
 */
const hashString = (str, salt = '') => {
  const hash = crypto.createHash('sha256');
  hash.update(str + salt);
  return hash.digest('hex');
};

/**
 * Generate HMAC
 * @param {string} data - Data to create HMAC for
 * @param {string} secret - Secret key
 * @returns {string} - HMAC hex string
 */
const generateHMAC = (data, secret) => {
  return crypto.createHmac(ENCRYPTION_CONFIG.HMAC_ALGORITHM, secret)
    .update(data)
    .digest('hex');
};

/**
 * Verify HMAC
 * @param {string} data - Original data
 * @param {string} signature - HMAC signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} - True if HMAC is valid
 */
const verifyHMAC = (data, signature, secret) => {
  const expectedSignature = generateHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

/**
 * Encrypt sensitive data
 * @param {string} plaintext - Data to encrypt
 * @param {string} password - Password for encryption
 * @returns {object} - Encrypted data with metadata
 */
const encrypt = (plaintext, password) => {
  try {
    // Generate salt and IV
    const salt = generateRandomBytes(ENCRYPTION_CONFIG.SALT_LENGTH);
    const iv = generateRandomBytes(ENCRYPTION_CONFIG.IV_LENGTH);
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Create cipher
    const cipher = crypto.createCipherGCM(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      algorithm: ENCRYPTION_CONFIG.ALGORITHM
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt sensitive data
 * @param {object} encryptedData - Encrypted data object
 * @param {string} password - Password for decryption
 * @returns {string} - Decrypted plaintext
 */
const decrypt = (encryptedData, password) => {
  try {
    const { encrypted, salt, iv, tag, algorithm } = encryptedData;
    
    // Verify algorithm
    if (algorithm !== ENCRYPTION_CONFIG.ALGORITHM) {
      throw new Error('Unsupported encryption algorithm');
    }
    
    // Convert hex strings back to buffers
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');
    
    // Derive key from password
    const key = deriveKey(password, saltBuffer);
    
    // Create decipher
    const decipher = crypto.createDecipherGCM(algorithm, key, ivBuffer);
    decipher.setAuthTag(tagBuffer);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
};

/**
 * Encrypt with master key (for application-level encryption)
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Base64 encoded encrypted data
 */
const encryptWithMasterKey = (plaintext) => {
  try {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('Master encryption key not configured');
    }
    
    const iv = generateRandomBytes(ENCRYPTION_CONFIG.IV_LENGTH);
    const key = Buffer.from(masterKey, 'hex');
    
    const cipher = crypto.createCipherGCM(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine iv + tag + encrypted data
    const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
    return combined.toString('base64');
  } catch (error) {
    throw new Error(`Master key encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt with master key
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {string} - Decrypted plaintext
 */
const decryptWithMasterKey = (encryptedData) => {
  try {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('Master encryption key not configured');
    }
    
    const combined = Buffer.from(encryptedData, 'base64');
    const key = Buffer.from(masterKey, 'hex');
    
    // Extract components
    const iv = combined.slice(0, ENCRYPTION_CONFIG.IV_LENGTH);
    const tag = combined.slice(ENCRYPTION_CONFIG.IV_LENGTH, ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.TAG_LENGTH);
    const encrypted = combined.slice(ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.TAG_LENGTH);
    
    const decipher = crypto.createDecipherGCM(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Master key decryption failed: ${error.message}`);
  }
};

/**
 * Hash password using bcrypt
 * @param {string} password - Password to hash
 * @param {number} rounds - Number of salt rounds
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async (password, rounds = ENCRYPTION_CONFIG.BCRYPT_ROUNDS) => {
  try {
    return await bcrypt.hash(password, rounds);
  } catch (error) {
    throw new Error(`Password hashing failed: ${error.message}`);
  }
};

/**
 * Verify password against hash
 * @param {string} password - Plain password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */
const verifyPassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    throw new Error(`Password verification failed: ${error.message}`);
  }
};

/**
 * Generate OTP
 * @param {number} length - OTP length
 * @param {boolean} alphanumeric - Include letters
 * @returns {string} - Generated OTP
 */
const generateOTP = (length = 6, alphanumeric = false) => {
  const digits = '0123456789';
  const chars = alphanumeric ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : digits;
  
  let otp = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    otp += chars[randomIndex];
  }
  
  return otp;
};

/**
 * Generate time-based OTP (TOTP)
 * @param {string} secret - Secret key
 * @param {number} timeStep - Time step in seconds
 * @param {number} digits - Number of digits
 * @returns {string} - TOTP
 */
const generateTOTP = (secret, timeStep = 30, digits = 6) => {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
  
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  
  const offset = hash[hash.length - 1] & 0xf;
  const code = ((hash[offset] & 0x7f) << 24) |
               ((hash[offset + 1] & 0xff) << 16) |
               ((hash[offset + 2] & 0xff) << 8) |
               (hash[offset + 3] & 0xff);
  
  const otp = code % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
};

/**
 * Verify TOTP
 * @param {string} token - Token to verify
 * @param {string} secret - Secret key
 * @param {number} window - Time window tolerance
 * @param {number} timeStep - Time step in seconds
 * @returns {boolean} - True if token is valid
 */
const verifyTOTP = (token, secret, window = 1, timeStep = 30) => {
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);
  
  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
    timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    
    const offset = hash[hash.length - 1] & 0xf;
    const code = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
    
    const otp = (code % Math.pow(10, 6)).toString().padStart(6, '0');
    
    if (otp === token) {
      return true;
    }
  }
  
  return false;
};

/**
 * Encrypt sensitive fields in object
 * @param {object} obj - Object with sensitive fields
 * @param {string[]} fields - Fields to encrypt
 * @param {string} password - Encryption password
 * @returns {object} - Object with encrypted fields
 */
const encryptObjectFields = (obj, fields, password) => {
  const result = { ...obj };
  
  fields.forEach(field => {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encrypt(String(result[field]), password);
    }
  });
  
  return result;
};

/**
 * Decrypt sensitive fields in object
 * @param {object} obj - Object with encrypted fields
 * @param {string[]} fields - Fields to decrypt
 * @param {string} password - Decryption password
 * @returns {object} - Object with decrypted fields
 */
const decryptObjectFields = (obj, fields, password) => {
  const result = { ...obj };
  
  fields.forEach(field => {
    if (result[field] !== undefined && result[field] !== null) {
      try {
        result[field] = decrypt(result[field], password);
      } catch (error) {
        console.error(`Failed to decrypt field ${field}:`, error.message);
        result[field] = null;
      }
    }
  });
  
  return result;
};

/**
 * Create digital signature
 * @param {string} data - Data to sign
 * @param {string} privateKey - Private key for signing
 * @returns {string} - Base64 encoded signature
 */
const createDigitalSignature = (data, privateKey) => {
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, 'base64');
  } catch (error) {
    throw new Error(`Digital signature creation failed: ${error.message}`);
  }
};

/**
 * Verify digital signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} publicKey - Public key for verification
 * @returns {boolean} - True if signature is valid
 */
const verifyDigitalSignature = (data, signature, publicKey) => {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch (error) {
    throw new Error(`Digital signature verification failed: ${error.message}`);
  }
};

/**
 * Generate key pair for RSA encryption
 * @param {number} keySize - Key size in bits
 * @returns {object} - Object with public and private keys
 */
const generateRSAKeyPair = (keySize = 2048) => {
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    return { publicKey, privateKey };
  } catch (error) {
    throw new Error(`RSA key pair generation failed: ${error.message}`);
  }
};

/**
 * Mask sensitive data for logging
 * @param {string} data - Data to mask
 * @param {number} visibleChars - Number of visible characters at start/end
 * @returns {string} - Masked data
 */
const maskSensitiveData = (data, visibleChars = 4) => {
  if (!data || data.length <= visibleChars * 2) {
    return '*'.repeat(data?.length || 8);
  }
  
  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  const middle = '*'.repeat(data.length - (visibleChars * 2));
  
  return start + middle + end;
};

/**
 * Secure data comparison (timing-safe)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 */
const secureCompare = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  
  return crypto.timingSafeEqual(bufferA, bufferB);
};

/**
 * Generate master encryption key
 * @returns {string} - Hex encoded master key
 */
const generateMasterKey = () => {
  return generateRandomBytes(ENCRYPTION_CONFIG.KEY_LENGTH).toString('hex');
};

/**
 * Encrypt payment card data (PCI compliance)
 * @param {object} cardData - Card data object
 * @returns {object} - Encrypted card data
 */
const encryptCardData = (cardData) => {
  const sensitiveFields = ['number', 'cvv'];
  return encryptObjectFields(cardData, sensitiveFields, process.env.CARD_ENCRYPTION_KEY);
};

/**
 * Decrypt payment card data
 * @param {object} encryptedCardData - Encrypted card data
 * @returns {object} - Decrypted card data
 */
const decryptCardData = (encryptedCardData) => {
  const sensitiveFields = ['number', 'cvv'];
  return decryptObjectFields(encryptedCardData, sensitiveFields, process.env.CARD_ENCRYPTION_KEY);
};

module.exports = {
  // Basic encryption
  encrypt,
  decrypt,
  encryptWithMasterKey,
  decryptWithMasterKey,
  
  // Hashing
  hashString,
  hashPassword,
  verifyPassword,
  
  // HMAC
  generateHMAC,
  verifyHMAC,
  
  // Random generation
  generateRandomBytes,
  generateSecureRandomString,
  generateSecureToken,
  generateApiKey,
  generateMasterKey,
  
  // OTP
  generateOTP,
  generateTOTP,
  verifyTOTP,
  
  // Object encryption
  encryptObjectFields,
  decryptObjectFields,
  
  // Digital signatures
  createDigitalSignature,
  verifyDigitalSignature,
  generateRSAKeyPair,
  
  // Utilities
  maskSensitiveData,
  secureCompare,
  deriveKey,
  
  // Payment specific
  encryptCardData,
  decryptCardData,
  
  // Configuration
  ENCRYPTION_CONFIG
};
