# DSH Vision Plugin (`dsh-vision-plugin`)

Plugin mở rộng cho **DeepSeek Harness (DSH)**, bổ sung tính năng **Add photos** và **Add files** ngay trong menu dấu cộng (`+`) của khung chat, hỗ trợ các model từ Custom Provider xem ảnh và đọc tài liệu/file.

---

## 🌟 Tính năng nổi bật

1. **Menu Dấu cộng (`+`) trên Chat UI**:
   - Thêm lựa chọn **Add photos** (`/photos`): Tải ảnh từ máy tính lên workspace và hướng dẫn model gọi tool `read_image`.
   - Thêm lựa chọn **Add files** (`/files`): Tải mọi tài liệu/tệp tin từ máy tính lên workspace và hướng dẫn model đọc file bằng tool `read`.

2. **Kiểm tra chặt chẽ Vision Capability**:
   - Tính năng **Add photos** tự động kiểm tra model hiện tại có hỗ trợ modality `image` hay không.
   - Nếu model thuần text: cảnh báo trực tiếp người dùng và không cho chọn ảnh, ngăn ngừa lỗi model không xem được ảnh.

3. **Lưu trữ tự động vào Workspace**:
   - Mọi tệp ảnh/file khi tải lên được lưu an toàn vào thư mục `uploads/` bên trong workspace hiện tại của project.
   - Tự động đánh số hậu tố nếu trùng tên (`image_1.png`, `image_2.png`...) tránh ghi đè dữ liệu cũ.

4. **Tự động chèn Prompt gọi Tool**:
   - Sau khi upload thành công, plugin tự động điền prompt vào khung chat với đường dẫn tương đối `uploads/...`:
     - Với ảnh: Yêu cầu model gọi tool `read_image` để xem và phân tích ảnh.
     - Với file: Yêu cầu model gọi tool `read` để đọc nội dung file.

---

## 🛠️ Cài đặt vào DeepSeek Harness

### Cách 1: Liên kết cục bộ vào Web Profile (Khuyên dùng)

1. Mở file `package.json` trong profile web của bạn (ví dụ: `C:\Users\Admin\.dsh\profiles\web\package.json`).
2. Thêm plugin vào mục `dependencies` và danh sách `bundles`:

```json
{
  "name": "dsh-profile-web",
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-vision-plugin"
      ]
    }
  },
  "dependencies": {
    "dsh-vision-plugin": "link:D:/dsh-vision-plugim"
  }
}
```

3. Chạy `pnpm install` trong thư mục profile:
```bash
cd C:\Users\Admin\.dsh\profiles\web
pnpm install
```

4. Khởi động lại DeepSeek Harness hoặc tải lại trang web `http://127.0.0.1:3080`.

---

## ⚙️ Cấu hình Custom Provider hỗ trợ Vision

Để model từ Custom Provider có thể xử lý ảnh, bạn cần khai báo `input: [text, image]` trong cấu hình model của provider (trong settings hoặc profile):

```yaml
models:
  - id: gpt-4o
    name: GPT-4o Vision
    input:
      - text
      - image
```

---

## 💻 Phát triển & Kiểm thử

```bash
# Cài đặt dependencies
pnpm install

# Chạy test suite
pnpm test

# Build host và web client bundle
pnpm run build
```

---

## 📁 Cấu trúc thư mục

```text
dsh-vision-plugin/
├── src/
│   ├── types.ts              # Interface định nghĩa API request & response
│   ├── index.ts              # Host-side entry point (Node.js Cordis plugin)
│   ├── host/
│   │   ├── endpoints.ts      # Xử lý check-vision và upload
│   │   └── file-utils.ts     # Xử lý lưu file & chống trùng tên
│   └── client/
│       ├── index.ts          # Client-side entry point (dsh.client)
│       ├── commands.ts       # Đăng ký lệnh photos và files vào commandUi
│       └── uploader.ts       # Kích hoạt file picker và upload lên host
├── lib/
│   ├── index.js              # Host bundle đã biên dịch
│   └── client.js             # Client bundle cho trình duyệt web
├── tests/                    # Bộ kiểm thử đơn vị Vitest
├── cordis.patch.yml          # Patch cấu hình Cordis
└── package.json
```
