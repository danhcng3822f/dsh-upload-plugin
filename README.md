# DSH Upload Plugin (`dsh-upload-plugin`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Plugin mở rộng cho **DeepSeek Harness (DSH)**, bổ sung tính năng **Add photos**, **Add files** và **Uploaded files** trực tiếp trong menu dấu cộng (`+`) trên thanh chat, hỗ trợ các model từ Custom Provider xem ảnh (Vision) và đọc tài liệu/tệp tin theo từng session một cách chuyên nghiệp.

---

## 🌟 Tính năng nổi bật

1. **Menu Dấu cộng (`+`) trên Chat UI**:
   - **📷 Add photos (`/photos`)**: Cho phép chọn **một hoặc nhiều ảnh cùng lúc** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`). Ảnh được đưa vào bản nháp dưới dạng **ảnh gốc (native draft image)** — model nhận **chính tấm ảnh**, không phải một câu chỉ dẫn. Không có chữ nào được dán vào ô nhập.
   - **📄 Add files (`/files`)**: Cho phép chọn **một hoặc nhiều tệp/tài liệu cùng lúc** (`.txt`, `.pdf`, `.json`, `.csv`, code, zip...), tải lên workspace và chèn một **chip tham chiếu** vào bản nháp. Chỉ dẫn đọc file được gửi tới model dưới dạng **Context injection** (xem mục 7).
   - **📂 Uploaded files (`/uploads`)**: Xem lại toàn bộ danh sách các tệp tin/hình ảnh đã tải lên trong phiên chat hiện tại và bấm để xem lại hoặc phân tích lại.

2. **Giao diện đính kèm chuẩn DeepSeek Chat (Native Composer Rail)**:
   - Thẻ đính kèm hiển thị trực tiếp **bên trong khung chat capsule**, đồng bộ hoàn toàn với font chữ, màu sắc, viền và bóng đổ ở cả **Light Mode** và **Dark Mode**.
   - **Thẻ file**: Chiều cao 64px, bo góc 16px, có huy hiệu đuôi file (`TXT`, `PDF`, `PY`...) nổi bật cùng tên và dung lượng file. Đây là nội dung chính của rail, vì rail vẽ đúng những **chip tham chiếu** đang có trong bản nháp.
   - **Ảnh** không đi qua rail này nữa: ảnh là **ảnh native của Harness**, do chính composer của DSH hiển thị. Rail của plugin chỉ còn vẽ thẻ ảnh cho những bản ghi ảnh cũ (tạo trước khi ảnh chuyển sang native) nếu bản nháp còn chip trỏ tới chúng.
   - Nút gỡ bỏ (`✕`) tinh tế, tự động hiện mượt mà khi rê chuột (`hover`).

3. **Phân tách file độc lập theo từng Session (Session Isolation)**:
   - Tệp tải lên nằm trong `uploads/<sessionId>/` và được đặt tên kèm thẻ session rút gọn (`session_{tag}__<ten_file>`), nên tệp của phiên này không lẫn sang phiên khác.
   - Menu `/uploads` của từng session chỉ hiển thị các tệp thuộc phiên đó.

4. **Ảnh đi nguyên bản, giới hạn do Harness quyết định**:
   - Ảnh **không còn được nén lại** trên đường đính kèm. Từ khi ảnh đi theo dạng native draft image, giới hạn (định dạng, số ảnh mỗi tin nhắn, dung lượng từng ảnh, tổng dung lượng) là do **deployment của Harness công bố** và plugin kiểm tra đúng theo đó — chứ không tự đặt ra một ngưỡng riêng.
   - Hàm nén ảnh (`optimizeImageIfNeeded`) vẫn còn trong `src/client/uploader.ts` nhưng **hiện không còn đường nào gọi tới nó**: cả hai lối đính kèm ảnh đều dùng intake native. Nó chỉ chạy khi `uploadMultipleFiles` được gọi với `isPhoto = true`, và không call site nào còn làm vậy.

5. **Kiểm tra tính năng Vision của Model**:
   - Cả **`/photos`** lẫn nút **`[📷]`** đều chạy **cùng một quy trình** (`intakePhotos`), nên hai lối vào không thể lệch nhau.
   - **Không chặn trước.** Batch ảnh được kiểm tra theo đúng giới hạn của deployment (định dạng, số lượng, dung lượng từng ảnh, tổng dung lượng) rồi mới được nhận. Nếu model đang dùng **không khai báo** đọc được ảnh, plugin vẫn nhận ảnh và chỉ **cảnh báo** — vì ảnh giờ đi như nội dung ảnh thật, provider sẽ từ chối lượt đó thay vì lặng lẽ bỏ qua một câu chỉ dẫn.
   - Việc model có đọc được ảnh hay không là do **khai báo** của bạn ở **Settings → Vision** — trang đó chỉ nói lên khai báo, không dò khả năng thật của upstream.

6. **Hai nút đính kèm ngay trên thanh công cụ composer**:
   - `[📷]` (Thêm ảnh) và `[📄]` (Thêm tệp) nằm trực tiếp trong thanh công cụ của khung nhập liệu, bên trái nút chọn model — dùng được ngay mà không cần mở menu dấu cộng.
   - `[📷]` đưa ảnh vào dưới dạng **ảnh native của Harness**; `[📄]` **tạo một chip tham chiếu** trong bản nháp.
   - Cả hai đều **không dán câu chỉ dẫn nào vào ô nhập**. Nội dung ô nhập của bạn vẫn nguyên vẹn — ngoại trừ chip tham chiếu (file) và một ký tự zero-width ẩn đi kèm nó.

7. **Chỉ dẫn đọc tệp đi bằng Context injection, không nằm trong tin nhắn của bạn**:
   - Câu chỉ dẫn ("hãy gọi tool `read_image`…" / "hãy đọc nội dung file này…") **không còn được ghép vào chữ của tin nhắn bạn gửi**. Nó tới model dưới dạng một dòng **Context injection** riêng — đúng cách DeepSeek Harness tự chèn ngữ cảnh của nó.
   - **Ảnh không cần chỉ dẫn nào cả**: ảnh đi như nội dung ảnh thật, nên model nhìn thấy chính tấm ảnh. Chỉ **file** mới cần câu chỉ dẫn, vì Harness không có loại nội dung `file` để gửi kèm.
   - **Đúng một lần cho mỗi lần gửi.** Tập đính kèm đang sống trong bản nháp được gửi tới Host và được "tiêu" khi lượt kế tiếp bắt đầu; **tin nhắn sau đó không mang theo chỉ dẫn nào**, trừ khi bạn đính kèm lại. Plugin không có hàng đợi chờ nào cả.
   - Ô nhập của bạn vẫn chỉ chứa **chip tham chiếu** — kèm một ký tự zero-width ẩn, cần thiết để Harness không coi tin nhắn chỉ-có-file là rỗng rồi âm thầm không gửi gì cả.

8. **Thanh đính kèm (rail) bám theo bản nháp đang sống**:
   - Rail hiển thị đúng những tệp mà bản nháp hiện tại đang tham chiếu, nên gửi xong rail tự trống.
   - Bấm `✕` để gỡ một đính kèm: chỉ chip tương ứng bị xoá khỏi bản nháp, **phần chữ bạn đã gõ được giữ nguyên**.

9. **Nút reasoning effort**:
   - Nút effort nằm trong tool row của composer, **bên trái nút chọn model**. Nút chọn model vẫn là của DeepSeek Harness — plugin không chiếm ghế đó.
   - Danh sách effort lấy từ **chính model khai báo trên Host** (`reasoning.efforts`), cộng thêm một dòng **Custom…** để bạn tự nhập giá trị khác. Model không khai báo effort thì không hiện nút effort.
   - Model tự khai trong settings (`llm-pi-ai.providers.<provider>.models`) **phải có `reasoningEfforts`** thì Host mới báo model đó có reasoning và nút mới hiện. Ví dụ: `"reasoningEfforts": { "off": null, "low": "low", "medium": "medium", "high": "high" }` — mỗi khoá là mức hiện trong menu, mỗi giá trị là chuỗi gửi lên provider; `off` để `null` nghĩa là "được hỗ trợ, gửi không tham số".

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

# Chạy kiểm thử tự động (Vitest, 167 unit test cho phần logic thuần)
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
│   ├── instruction.ts        # Câu chỉ dẫn đọc tệp — MỘT định nghĩa, dùng chung cho cả host lẫn client
│   ├── index.ts              # Host-side entry point (Cordis plugin, WebServer endpoints & context injection)
│   ├── host/
│   │   ├── endpoints.ts      # Xử lý check vision, upload file, list uploads, view file và sync refs
│   │   ├── file-utils.ts     # Tiện ích định danh file và phân giải đường dẫn duy nhất
│   │   ├── refs-store.ts     # Tập đính kèm đang sống mỗi session (Host giữ, client đẩy lên)
│   │   ├── context-injection.ts # Chèn chỉ dẫn vào lượt kế tiếp qua `agent/pre-step`
│   │   └── llm-modules.d.ts  # Khai báo kiểu hợp đồng Harness mà nửa Host dùng
│   └── client/
│       ├── index.ts          # Client-side entry point (nạp vào trình duyệt)
│       ├── commands.ts       # Đăng ký lệnh /photos, /files, /uploads vào menu dấu cộng
│       ├── attachment-bar.ts # Thanh đính kèm trong chat composer & Lightbox viewer
│       ├── attachments.ts    # Bản ghi đính kèm và các phép toán danh sách thuần
│       ├── attachment-store.ts # Kho bản ghi theo từng session (localStorage)
│       ├── reference.ts      # Nguồn tham chiếu `vision` + mint chip vào bản nháp
│       ├── ref-sync.ts       # Đẩy tập đính kèm đang sống lên Host khi bản nháp đổi
│       ├── intake.ts         # Quy trình nhận ảnh native, dùng chung cho 📷 và /photos
│       ├── effort.ts         # Dựng menu reasoning effort từ metadata của Host
│       ├── vision-setting.ts # Đọc-sửa-ghi trường `input` của một dòng model
│       ├── platform-modules.d.ts # Khai báo kiểu cho platform module không cài được qua npm
│       ├── composer/
│       │   ├── attach-buttons.tsx # Hai nút 📷 / 📄 trên thanh công cụ composer
│       │   ├── effort-control.tsx # Nút reasoning effort (bên trái nút chọn model)
│       │   └── icons.tsx     # Icon riêng của plugin
│       ├── settings/
│       │   └── vision-section.tsx # Trang Settings → Vision
│       └── uploader.ts       # File picker và upload
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
