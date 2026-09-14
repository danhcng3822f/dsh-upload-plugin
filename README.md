# DSH Upload Plugin (`dsh-upload-plugin`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Plugin mở rộng cho **DeepSeek Harness (DSH)**, bổ sung tính năng **Add photos**, **Add files** và **Uploaded files** trực tiếp trong menu dấu cộng (`+`) trên thanh chat, hỗ trợ các model từ Custom Provider xem ảnh (Vision) và đọc tài liệu/tệp tin theo từng session một cách chuyên nghiệp.

---

## 🌟 Tính năng nổi bật

1. **Menu Dấu cộng (`+`) trên Chat UI**:
   - **📷 Add photos (`/photos`)**: Cho phép chọn **một hoặc nhiều ảnh cùng lúc** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`), tải lên workspace và tự động chèn prompt hướng dẫn model gọi tool `read_image`.
   - **📄 Add files (`/files`)**: Cho phép chọn **một hoặc nhiều tệp/tài liệu cùng lúc** (`.txt`, `.pdf`, `.json`, `.csv`, code, zip...), tải lên workspace và tự động chèn prompt hướng dẫn model đọc file bằng tool `read`.
   - **📂 Uploaded files (`/uploads`)**: Xem lại toàn bộ danh sách các tệp tin/hình ảnh đã tải lên trong phiên chat hiện tại và bấm để xem lại hoặc phân tích lại.

2. **Giao diện đính kèm chuẩn DeepSeek Chat (Native Composer Rail)**:
   - Thẻ đính kèm hiển thị trực tiếp **bên trong khung chat capsule**, đồng bộ hoàn toàn với font chữ, màu sắc, viền và bóng đổ ở cả **Light Mode** và **Dark Mode**.
   - **Thẻ ảnh**: Chuẩn hình vuông 64x64px, bo góc tròn 16px (`border-radius: 16px`), bấm vào để xem ảnh phóng to toàn màn hình qua **Lightbox viewer**.
   - **Thẻ file**: Chiều cao 64px, bo góc 16px, có huy hiệu đuôi file (`TXT`, `PDF`, `PY`...) nổi bật cùng tên và dung lượng file.
   - Nút gỡ bỏ (`✕`) tinh tế, tự động hiện mượt mà khi rê chuột (`hover`).

3. **Phân tách file độc lập theo từng Session (Session Isolation)**:
   - Các file tải lên được gắn mã định danh session (`uploads/session_{sessionId}__<ten_file>`), đảm bảo tệp của session này không bị hiển thị hay rò rỉ sang session khác.
   - Menu `/uploads` của từng session chỉ hiển thị các tệp thuộc phiên đó.

4. **Tự động nén ảnh thông minh (> 4.5MB)**:
   - Tự động phát hiện và nén/resize các ảnh độ phân giải siêu lớn (> 4.5MB) trước khi tải lên, giúp tránh vượt quá giới hạn 5MB (`5,242,880 bytes`) của tool `read_image` trong DeepSeek Harness.

5. **Kiểm tra chặt chẽ tính năng Vision của Model**:
   - Tự động kiểm tra model đang kích hoạt có cấu hình `input: [text, image]` hay không. Nếu model thuần text, hệ thống sẽ cảnh báo trực tiếp người dùng trước khi upload.

---

## 🛠️ Cài đặt vào DeepSeek Harness

### Cách 1: Cài đặt bằng 1 dòng lệnh duy nhất (Khuyên dùng)

Mở terminal và chạy lệnh:

```bash
# Nếu dùng lệnh dsh:
dsh plugin --profile web add github:danhcng3822f/dsh-upload-plugin

# Hoặc nếu dùng pnpm trực tiếp:
pnpm --prefix ~/.dsh/profiles/web add github:danhcng3822f/dsh-upload-plugin
```

> **Lưu ý:** DeepSeek Harness sẽ tự động nạp plugin vào profile `web`, tự động đăng ký vào danh sách `bundles` mà bạn **không cần phải chỉnh sửa file cấu hình bằng tay**. Sau đó chỉ cần khởi động lại DSH hoặc tải lại trang web `http://127.0.0.1:3080`.

---

### Cách 2: Cài đặt từ mã nguồn cục bộ (Dành cho Developer)

1. Clone repository về máy tính:
```bash
git clone https://github.com/danhcng3822f/dsh-upload-plugin.git
cd dsh-upload-plugin
pnpm install
pnpm run build
```

2. Chạy lệnh liên kết vào profile:
```bash
pnpm --prefix ~/.dsh/profiles/web add link:/duong/dan/toi/dsh-upload-plugin
```

---

## ⚙️ Cấu hình Custom Provider hỗ trợ Vision

Để model từ Custom Provider có thể xem và phân tích ảnh, hãy thêm modality `"image"` vào trường `"input"` trong cấu hình provider của bạn:

```json
{
  "id": "claude-opus-5-thinking",
  "name": "Claude Opus 5 Thinking",
  "input": ["text", "image"]
}
```

---

## 💻 Lệnh phát triển & Kiểm thử

```bash
# Cài đặt thư viện
pnpm install

# Chạy kiểm thử tự động (Vitest)
pnpm test

# Build mã nguồn (Host TypeScript & Client ESBuild Bundle)
pnpm run build
```

---

## 📁 Cấu trúc dự án

```text
dsh-upload-plugin/
├── src/
│   ├── types.ts              # Định nghĩa interface API & kiểu dữ liệu
│   ├── index.ts              # Host-side entry point (Node.js Cordis plugin & WebServer endpoints)
│   ├── host/
│   │   ├── endpoints.ts      # Xử lý check vision, upload file, list uploads và view file
│   │   └── file-utils.ts     # Tiện ích định danh file và phân giải đường dẫn duy nhất
│   └── client/
│       ├── index.ts          # Client-side entry point (nạp vào trình duyệt)
│       ├── commands.ts       # Đăng ký lệnh /photos, /files, /uploads vào menu dấu cộng
│       ├── attachment-bar.ts # Thanh đính kèm trong chat composer & Lightbox viewer
│       └── uploader.ts       # File picker, nén ảnh, upload và sinh prompt
├── lib/
│   ├── index.js              # Host bundle đã biên dịch
│   └── client.js             # Client bundle trình duyệt (Web)
├── tests/                    # Bộ kiểm thử đơn vị tự động Vitest
├── cordis.patch.yml          # Cấu hình Cordis DI
├── LICENSE                   # Giấy phép nguồn mở MIT
└── package.json
```

---

## 📄 Giấy phép (License)

Dự án được phân phối dưới giấy phép nguồn mở [MIT License](LICENSE).
