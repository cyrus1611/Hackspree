const crypto = require('crypto');

class EncryptionManager {
  constructor() {
    this.masterKey = process.env.MASTER_ENCRYPTION_KEY;
    this.cardKey = process.env.CARD_ENCRYPTION_KEY;
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Generate a master encryption key
   */
  static generateMasterKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a card encryption key
   */
  static generateCardKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt sensitive data using master key
   */
  encryptData(data, useCardKey = false) {
    try {
      const key = useCardKey ? 
        Buffer.from(this.cardKey, 'hex') : 
        Buffer.from(this.masterKey, 'hex');
      
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from('square-payment', 'utf8'));

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      throw new Error('Encryption failed: ' + error.message);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decryptData(encryptedData, useCardKey = false) {
    try {
      const key = useCardKey ? 
        Buffer.from(this.cardKey, 'hex') : 
        Buffer.from(this.masterKey, 'hex');

      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from('square-payment', 'utf8'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  }

  /**
   * Hash sensitive data for storage
   */
  hashData(data, salt = null) {
    const actualSalt = salt || crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha256');
    
    return {
      hash: hash.toString('hex'),
      salt: actualSalt
    };
  }

  /**
   * Verify hashed data
   */
  verifyHash(data, hash, salt) {
    const verifyHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha256');
    return hash === verifyHash.toString('hex');
  }

  /**
   * Generate HMAC for webhook verification
   */
  generateHMAC(data, secret) {
    return crypto.createHmac('sha256', secret)
      .update(data, 'utf8')
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data, signature, secret) {
    const expectedSignature = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }
}

module.exports = EncryptionManager;
