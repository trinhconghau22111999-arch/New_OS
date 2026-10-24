# New OS — 3 bản

Cùng một giao diện web (`app/src/main/assets`), đóng gói thành 3 bản:

| Bản | Nền tảng | Thư mục | Kết quả build |
|---|---|---|---|
| **Android** | Android 7.0 (API 24) trở lên, mọi CPU (ARM/Intel) | `app/` | `app-release.apk` (workflow *Build & Release APK*) |
| **PC** | Windows 10 trở lên (x64 + x86) — cửa sổ đầy đủ | `desktop/` | `NewOS-PC-Setup-*.exe` |
| **Widget** | Windows 10 trở lên — khung 1/4 màn hình gắn lên màn hình nền | `desktop/` | `NewOS-Widget-Setup-*.exe` |

Bản **Widget**: không viền, không hiện trên taskbar, luôn nằm dưới các cửa sổ khác như gadget. Kéo thanh menu trên cùng để di chuyển; biểu tượng khay hệ thống để hiện/ẩn, đưa về góc, tải lại, tự chạy cùng Windows, thoát. Phím tắt **Ctrl+Alt+N** hiện/ẩn.

Build Windows trên GitHub Actions (workflow *Build Windows*), hoặc chạy thử trên máy:

```
cd desktop && npm install
npm start          # bản PC
npm run start:widget
npm run dist:pc / dist:widget
```
