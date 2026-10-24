// Chép giao diện web dùng chung của app Android (app/src/main/assets) sang desktop/www,
// bỏ phần chỉ dành cho Android (WebView đóng gói sẵn, dock native, trang dọn dẹp).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const dst = path.join(__dirname, '..', 'www');
const skip = new Set(['webview', 'dock.html', 'purge-old.html']);
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const n of fs.readdirSync(src)) {
  if (skip.has(n)) continue;
  fs.cpSync(path.join(src, n), path.join(dst, n), { recursive: true });
}
console.log('Đã chép giao diện web vào', dst);
