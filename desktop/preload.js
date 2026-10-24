// Đánh dấu chế độ (pc / widget) lên <html> để giao diện có thể chỉnh riêng nếu cần.
// Chế độ do main.js truyền qua additionalArguments (preload sandbox không đọc được package.json).
const { contextBridge } = require('electron');
const arg = process.argv.find(a => a.startsWith('--newos-mode='));
const mode = arg ? arg.split('=')[1] : 'pc';
contextBridge.exposeInMainWorld('NewOSDesktop', { mode, platform: process.platform });
window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('desk-' + mode));
