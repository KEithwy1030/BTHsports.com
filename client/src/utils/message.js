/**
 * 统一的弹窗消息工具
 * 要求：
 * 1. 所有消息必须具体明确，不能模糊
 * 2. 成功、报错、提醒三种类型使用不同颜色，样式更大更醒目
 */

import { ElMessage } from 'element-plus'

// 消息配置
const MESSAGE_CONFIG = {
  success: {
    type: 'success',
    duration: 3000,
    showClose: true,
    customClass: 'custom-message-success',
    offset: 80
  },
  error: {
    type: 'error',
    duration: 4000, // 错误信息显示更久
    showClose: true,
    customClass: 'custom-message-error',
    offset: 80
  },
  warning: {
    type: 'warning',
    duration: 3500,
    showClose: true,
    customClass: 'custom-message-warning',
    offset: 80
  },
  info: {
    type: 'info',
    duration: 3000,
    showClose: true,
    customClass: 'custom-message-info',
    offset: 80
  }
}

/**
 * 显示成功消息
 * @param {string} message - 消息内容（必须具体明确）
 */
export const showSuccess = (message) => {
  if (!message || typeof message !== 'string') {
    console.warn('showSuccess: 消息内容不能为空且必须是字符串')
    return
  }
  
  ElMessage({
    ...MESSAGE_CONFIG.success,
    message: message
  })
}

/**
 * 显示错误消息
 * @param {string} message - 错误消息内容（必须具体明确，说明具体错误原因）
 */
export const showError = (message) => {
  if (!message || typeof message !== 'string') {
    console.warn('showError: 错误消息内容不能为空且必须是字符串')
    return
  }
  
  // 如果消息太模糊，添加提示
  const vagueMessages = ['失败', '错误', '异常', '出错了', '请稍后重试']
  if (vagueMessages.some(vague => message.includes(vague) && message.length < 15)) {
    console.warn('showError: 错误消息可能过于模糊，建议提供更具体的错误信息')
  }
  
  ElMessage({
    ...MESSAGE_CONFIG.error,
    message: message
  })
}

/**
 * 显示警告/提醒消息
 * @param {string} message - 警告消息内容（必须具体明确）
 */
export const showWarning = (message) => {
  if (!message || typeof message !== 'string') {
    console.warn('showWarning: 警告消息内容不能为空且必须是字符串')
    return
  }
  
  ElMessage({
    ...MESSAGE_CONFIG.warning,
    message: message
  })
}

/**
 * 显示信息消息
 * @param {string} message - 信息消息内容（必须具体明确）
 */
export const showInfo = (message) => {
  if (!message || typeof message !== 'string') {
    console.warn('showInfo: 信息消息内容不能为空且必须是字符串')
    return
  }
  
  ElMessage({
    ...MESSAGE_CONFIG.info,
    message: message
  })
}

/**
 * 从错误对象中提取具体的错误消息
 * @param {Error|Object} error - 错误对象
 * @param {string} defaultMessage - 默认消息（如果无法提取具体错误）
 * @returns {string} 具体的错误消息
 */
export const extractErrorMessage = (error, defaultMessage = '操作失败，请稍后重试') => {
  if (!error) {
    return defaultMessage
  }
  
  // 优先使用后端返回的具体错误消息
  if (error.response?.data?.message) {
    return error.response.data.message
  }
  
  if (error.response?.data?.error) {
    return error.response.data.error
  }
  
  // 使用错误对象的message
  if (error.message) {
    return error.message
  }
  
  // 如果是字符串，直接返回
  if (typeof error === 'string') {
    return error
  }
  
  // 最后使用默认消息
  return defaultMessage
}

/**
 * 显示API错误消息（自动提取具体错误信息）
 * @param {Error|Object} error - 错误对象
 * @param {string} defaultMessage - 默认消息
 */
export const showApiError = (error, defaultMessage = '请求失败，请检查网络连接或稍后重试') => {
  const message = extractErrorMessage(error, defaultMessage)
  showError(message)
}

// 默认导出
export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  apiError: showApiError,
  extractErrorMessage
}

