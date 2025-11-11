const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'system.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(level, message, meta) {
  const base = `${new Date().toISOString()} [${level}] ${message}`;
  if (!meta) return base;
  try {
    return `${base} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  } catch (error) {
    return `${base} ${meta}`;
  }
}

function write(level, message, meta) {
  ensureLogDir();
  const line = `${formatLine(level, message, meta)}\n`;
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      console.error('日志写入失败:', err);
    }
  });
}

module.exports = {
  info(message, meta) {
    write('INFO', message, meta);
  },
  warn(message, meta) {
    write('WARN', message, meta);
  },
  error(message, meta) {
    write('ERROR', message, meta);
  },
  debug(message, meta) {
    if (process.env.DEBUG_LOG === 'true') {
      write('DEBUG', message, meta);
    }
  }
};

