/**
 * 敏感词过滤工具
 * 简单实现：使用常见敏感词列表
 */

// 常见敏感词列表（可根据需要扩展）
const sensitiveWords = [
  '政治', '色情', '赌博', '诈骗', '毒品', '暴力',
  '反动', '分裂', '邪教', '迷信', '传销'
];

/**
 * 检查文本是否包含敏感词
 * @param {string} text - 待检查的文本
 * @returns {boolean} - 是否包含敏感词
 */
function containsSensitiveWord(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const lowerText = text.toLowerCase();
  return sensitiveWords.some(word => lowerText.includes(word.toLowerCase()));
}

/**
 * 过滤敏感词（替换为*）
 * @param {string} text - 待过滤的文本
 * @returns {string} - 过滤后的文本
 */
function filterSensitiveWords(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let filteredText = text;
  sensitiveWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });

  return filteredText;
}

module.exports = {
  containsSensitiveWord,
  filterSensitiveWords,
  sensitiveWords
};

