// New OS cho Windows 10+ — hai chế độ dùng chung một giao diện web:
//   pc     : cửa sổ đầy đủ
//   widget : khung 1/4 màn hình (1/2 rộng x 1/2 cao) gắn lên màn hình nền: không viền, không hiện trên taskbar,
//            luôn nằm DƯỚI các cửa sổ khác (như gadget), có biểu tượng khay hệ thống để điều khiển.
const { app, BrowserWindow, Tray, Menu, screen, protocol, net, session, shell, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mode = 'pc';
try { mode = require('./package.json').mode || 'pc'; } catch (e) {}
if (process.argv.includes('--widget')) mode = 'widget';
const WIDGET = mode === 'widget';

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

protocol.registerSchemesAsPrivileged([{ scheme: 'newos', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

const WWW = path.join(__dirname, 'www');
const ICON = path.join(__dirname, 'build', 'icon.png');
let win = null, tray = null, quitting = false, bottomTimer = null;

/* ---------- cấu hình nhỏ (vị trí widget) ---------- */
const cfgFile = () => path.join(app.getPath('userData'), 'widget.json');
const loadCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const saveCfg = c => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };

/* ---------- đẩy cửa sổ xuống đáy z-order (Windows) ---------- */
let setPos = null;
if (WIDGET && process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    setPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t after, int x, int y, int cx, int cy, uint32 flags)');
  } catch (e) { setPos = null; }
}
function toBottom() {
  if (!win || win.isDestroyed() || !setPos || win.isFocused()) return;
  try {
    const b = win.getNativeWindowHandle();
    const h = b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0);
    // HWND_BOTTOM = 1; SWP_NOSIZE|NOMOVE|NOACTIVATE = 0x13
    setPos(h, 1, 0, 0, 0, 0, 0x13);
  } catch (e) {}
}

/* ---------- kích thước / vị trí widget ---------- */
function quarterBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(wa.width / 2), h = Math.round(wa.height / 2);
  const c = loadCfg();
  if (c.bounds && c.bounds.display === screen.getPrimaryDisplay().id) {
    const x = Math.min(Math.max(c.bounds.x, wa.x), wa.x + wa.width - w);
    const y = Math.min(Math.max(c.bounds.y, wa.y), wa.y + wa.height - h);
    return { x, y, width: w, height: h };
  }
  return { x: wa.x + wa.width - w, y: wa.y + wa.height - h, width: w, height: h }; // góc dưới phải
}
function toCorner(corner) {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(wa.width / 2), h = Math.round(wa.height / 2);
  const x = corner.includes('l') ? wa.x : wa.x + wa.width - w;
  const y = corner.includes('t') ? wa.y : wa.y + wa.height - h;
  win.setBounds({ x, y, width: w, height: h });
  saveCfg({ ...loadCfg(), bounds: { x, y, display: screen.getPrimaryDisplay().id } });
}

/* ---------- cửa sổ ---------- */
function createWindow() {
  const common = {
    show: false, icon: ICON, backgroundColor: '#1c1d22', title: WIDGET ? 'New OS Widget' : 'New OS',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), additionalArguments: ['--newos-mode=' + mode], contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  };
  if (WIDGET) {
    win = new BrowserWindow({
      ...common, ...quarterBounds(),
      frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      skipTaskbar: true, hasShadow: false, alwaysOnTop: false
    });
  } else {
    win = new BrowserWindow({ ...common, width: 1280, height: 800, minWidth: 900, minHeight: 600, autoHideMenuBar: true });
  }
  win.loadURL('newos://app/index.html');
  win.once('ready-to-show', () => { win.show(); if (WIDGET) toBottom(); });

  // Liên kết ra ngoài mở bằng trình duyệt mặc định của Windows
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('newos://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });

  if (WIDGET) {
    // Kéo thanh menu trên cùng để di chuyển khung; các nút vẫn bấm bình thường
    win.webContents.on('dom-ready', () => {
      win.webContents.insertCSS('#menubar{-webkit-app-region:drag} #menubar *{-webkit-app-region:no-drag} html,body{overflow:hidden} body{padding:0!important} .stage{min-height:0!important;border-radius:0!important}');
    });
    win.on('blur', () => setTimeout(toBottom, 80));
    win.on('show', () => setTimeout(toBottom, 80));
    win.on('moved', () => { const b = win.getBounds(); saveCfg({ ...loadCfg(), bounds: { x: b.x, y: b.y, display: screen.getDisplayMatching(b).id } }); });
    bottomTimer = setInterval(toBottom, 2000); // phòng khi cửa sổ khác kéo widget lên trên
    // Đóng (Alt+F4) chỉ ẩn xuống khay, không thoát
    win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  } else {
    win.on('closed', () => { win = null; });
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('New OS Widget');
  const toggle = () => { if (!win) return; if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } };
  const menu = () => Menu.buildFromTemplate([
    { label: 'Hiện / ẩn khung', click: toggle },
    { label: 'Đưa về góc', submenu: [
      { label: 'Trên trái', click: () => toCorner('tl') }, { label: 'Trên phải', click: () => toCorner('tr') },
      { label: 'Dưới trái', click: () => toCorner('bl') }, { label: 'Dưới phải', click: () => toCorner('br') } ] },
    { label: 'Tải lại', click: () => win && win.webContents.reload() },
    { label: 'Khởi động cùng Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Thoát', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('double-click', toggle);
}

app.whenReady().then(() => {
  // newos://app/... -> thư mục www (có chống thoát thư mục)
  protocol.handle('newos', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(WWW, p));
    if (!full.startsWith(WWW)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });

  // Cho các trang nhúng (Zalo, Facebook, YouTube...) hiện trong khung của New OS
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    if (d.resourceType === 'subFrame') {
      for (const k of Object.keys(h)) {
        const l = k.toLowerCase();
        if (l === 'x-frame-options') delete h[k];
        if (l === 'content-security-policy') h[k] = h[k].map(v => v.replace(/frame-ancestors[^;]*;?/gi, ''));
      }
    }
    cb({ responseHeaders: h });
  });
  // Micro / camera / thông báo / clipboard cho giao diện (ghi âm, webcam, ...)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture'].includes(perm)));

  Menu.setApplicationMenu(null);
  createWindow();
  if (WIDGET) {
    createTray();
    globalShortcut.register('Control+Alt+N', () => { if (!win) return; if (win.isVisible() && win.isFocused()) win.hide(); else { win.show(); win.focus(); } });
    screen.on('display-metrics-changed', () => { if (win) win.setBounds(quarterBounds()); });
  }
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('before-quit', () => { quitting = true; if (bottomTimer) clearInterval(bottomTimer); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (!WIDGET) app.quit(); });
