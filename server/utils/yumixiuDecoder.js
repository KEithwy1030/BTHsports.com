const logger = require('./logger');
const XXTEA = require('./xxtea');

const YUMIXIU_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWX';

function decodeYumixiu(encodedStr) {
  if (!encodedStr) {
    return null;
  }

  try {
    const decrypted = XXTEA.decryptFromBase64(encodedStr, YUMIXIU_KEY);
    if (!decrypted) {
      return null;
    }

    const payload = JSON.parse(decrypted);
    if (payload && payload.url) {
      return {
        url: payload.url,
        ts: payload.ts || null,
      };
    }
  } catch (error) {
    logger.warn('decodeYumixiu 解析失败', {
      message: error.message,
    });
  }

  return null;
}

module.exports = {
  decodeYumixiu,
};

