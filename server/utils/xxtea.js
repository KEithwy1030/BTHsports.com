const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptSource = fs.readFileSync(
  path.join(__dirname, 'vendor', 'yumixiu_index.min.js'),
  'utf8'
);

const context = {};
vm.createContext(context);
vm.runInContext(scriptSource, context);

module.exports = context.XXTEA;

