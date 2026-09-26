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

5. **Kiểm tra tính năng Vision của Model (trên đường `/photos`)**:
   - Khi bạn dùng **`/photos`** trong menu dấu cộng, plugin kiểm tra model đang kích hoạt có cấu hình `input: [text, image]` hay không. Nếu model thuần text, danh sách lựa chọn hiện cảnh báo và **không mở** hộp chọn ảnh.
   - Hai nút `[📷]` `[📄]` trên thanh công cụ composer (mục 6) **không kiểm tra trước**: chúng luôn đính kèm và tạo chip. Việc model có đọc được ảnh hay không là do **khai báo** của bạn ở **Settings → Vision** — trang đó chỉ nói lên khai báo, không dò khả năng thật của upstream.

6. **Hai nút đính kèm ngay trên thanh công cụ composer**:
   - `[📷]` (Thêm ảnh) và `[📄]` (Thêm tệp) nằm trực tiếp trong thanh công cụ của khung nhập liệu, bên trái nút chọn model — dùng được ngay mà không cần mở menu dấu cộng.
   - Đính kèm **tạo ra một chip trong bản nháp**, **không dán chữ vào ô nhập**. Bản nháp chỉ chứa chip tham chiếu; nội dung ô nhập của bạn vẫn nguyên vẹn.

7. **Chèn chỉ dẫn đọc tệp đúng một lần cho mỗi lần gửi (One-shot injection)**:
   - Câu chỉ dẫn ("hãy gọi tool `read_image`…" / "hãy đọc nội dung file này…") **không nằm trong ô nhập**. Nó được sinh ra ở **thời điểm gửi** và ghép vào **chính tin nhắn đang gửi**.
   - **Tin nhắn kế tiếp không mang theo chỉ dẫn nào**, trừ khi bạn đính kèm lại. Plugin không có hàng đợi chờ nào cả.

8. **Thanh đính kèm (rail) bám theo bản nháp đang sống**:
   - Rail hiển thị đúng những tệp mà bản nháp hiện tại đang tham chiếu, nên gửi xong rail tự trống.
   - Bấm `✕` để gỡ một đính kèm: chỉ chip tương ứng bị xoá khỏi bản nháp, **phần chữ bạn đã gõ được giữ nguyên**.

9. **Ghế model + effort hợp nhất**:
   - Nút model và nút effort nằm cạnh nhau trong cùng một ghế.
   - Danh sách effort lấy từ **chính model khai báo trên Host** (`reasoning.efforts`), cộng thêm một dòng **Custom…** để bạn tự nhập giá trị khác. Model không khai báo effort thì không hiện nút effort.

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

## 🖼️ Trang Settings → Vision của plugin

Plugin đăng ký thêm một trang cấu hình riêng: **Settings → Vision**. Thay vì sửa JSON bằng tay, bạn bật/tắt khả năng đọc ảnh cho từng model bằng checkbox.

- **Một toggle cho mỗi model**, nhóm theo từng provider. Model nào không có `id` sẽ bị bỏ qua (có ghi chú số lượng bỏ qua).
- Bật toggle sẽ ghi `input: ["text","image"]` vào đúng dòng model đó; tắt toggle sẽ **xoá hẳn** khoá `input` khỏi dòng.
- **Đây là một khai báo (declaration), không phải phép đo.** Trang này chỉ nói lên rằng model *được khai báo* là đọc được ảnh — nó **không hề kiểm tra** upstream có thật sự phục vụ ảnh hay không.
- Các toggle ghi vào **cùng tài liệu settings mà trang Models đang quản lý** (namespace `llm-pi-ai`), chứ không tạo bản sao riêng. Mỗi lần ghi chỉ định đúng một đường dẫn `providers.<id>.models`, nên **mọi trường khác của dòng model và của provider đều được giữ nguyên** — kể cả những trường plugin này không biết.
- Trang đọc lại tài liệu ngay trước khi ghi và gửi kèm `expectedRevision`, nên nếu cấu hình vừa bị đổi ở nơi khác thì thao tác bị từ chối (báo "Cấu hình vừa bị thay đổi ở nơi khác. Thử lại.") thay vì ghi đè.
- Trang **tự làm mới** khi tài liệu settings bị thay đổi từ nơi khác (trang Models, tab khác, hoặc sửa file bằng tay): nó theo dõi sự kiện `settings/document-updated` của namespace `llm-pi-ai`.
- Nếu Host đang ở chế độ chỉ đọc, các checkbox bị vô hiệu hoá và trang nói rõ điều đó.

---

## 💻 Lệnh phát triển & Kiểm thử

```bash
# Cài đặt thư viện
pnpm install

# Chạy kiểm thử tự động (Vitest, 74 unit test cho phần logic thuần)
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
│       ├── attachments.ts    # Bản ghi đính kèm và các phép toán danh sách thuần
│       ├── attachment-store.ts # Kho bản ghi theo từng session (localStorage)
│       ├── reference.ts      # Nguồn tham chiếu `vision` + mint chip vào bản nháp
│       ├── instruction.ts    # Câu chỉ dẫn đọc tệp (sinh ra lúc gửi)
│       ├── effort.ts         # Dựng menu reasoning effort từ metadata của Host
│       ├── vision-setting.ts # Đọc-sửa-ghi trường `input` của một dòng model
│       ├── composer/
│       │   ├── attach-buttons.tsx # Hai nút 📷 / 📄 trên thanh công cụ composer
│       │   └── model-seat.tsx     # Ghế model + effort hợp nhất
│       ├── settings/
│       │   └── vision-section.tsx # Trang Settings → Vision
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
