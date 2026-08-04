Halo Tim Development,

Kami sudah melakukan review ulang terhadap repository Bee Box. Saat ini branch `main` masih berada pada commit:

`34e4f03045435813b462733d24ca125294a88911`

Belum terlihat commit baru setelah perbaikan terakhir. Mohon pastikan seluruh perubahan sudah di-push ke repository agar dapat dilakukan verifikasi ulang.

Berikut poin yang perlu ditindaklanjuti.

## P0 — Security dan Pilot Blocker

### 1. Stored XSS pada Teacher Web

Mohon audit seluruh penggunaan `innerHTML`, khususnya pada data yang berasal dari user atau database, seperti:

* nama siswa;
* nama kelas;
* avatar;
* data profile;
* data roster.

Gunakan `textContent`, DOM API, atau sanitization yang aman.

Acceptance criteria:

* Input HTML atau JavaScript pada nama siswa tidak boleh dijalankan pada dashboard guru.
* Data user hanya tampil sebagai text.
* Tambahkan automated test untuk payload XSS.

### 2. Registrasi Role Teacher

Endpoint registrasi publik saat ini tidak boleh mengizinkan user menentukan role dengan hak khusus secara bebas.

Perbaikan yang diharapkan:

* Registrasi publik hanya untuk `STUDENT` dan `PARENT`.
* Akun `TEACHER` dibuat atau diundang oleh administrator sekolah.
* Tambahkan status akun seperti `PENDING`, `ACTIVE`, `SUSPENDED`, dan `REJECTED`.
* Middleware harus memvalidasi status akun sebelum memberi akses.

Acceptance criteria:

* Request register dengan role `TEACHER` harus ditolak.
* Akun suspended tidak dapat mengakses API walaupun token belum expired.

### 3. Parent–Student Relationship

Proses claim anak perlu diperketat karena saat ini hubungan dapat terbentuk menggunakan kode statis.

Perbaikan yang diharapkan:

* Kode claim memiliki expiry.
* Kode hanya dapat digunakan satu kali.
* Relationship awal menggunakan status `PENDING`.
* Tersedia proses approve atau verification.
* Tersedia unlink atau revoke relationship.
* Claim dicatat pada audit log.

Acceptance criteria:

* Kode expired ditolak.
* Kode yang sudah digunakan tidak bisa dipakai kembali.
* Parent yang sudah direvoke tidak dapat lagi melihat data anak.

### 4. Game dan Exam Harus Server-Authoritative

Client tidak boleh menjadi sumber kebenaran untuk:

* `isExam`;
* `questionCount`;
* grade;
* sublevel;
* durasi;
* reward XP;
* bonus.

Konfigurasi harus ditentukan dan divalidasi oleh backend.

Acceptance criteria:

* User tidak dapat farming XP menggunakan satu pertanyaan.
* User tidak dapat membuka grade atau sublevel terkunci.
* User tidak dapat memulai exam tanpa konfigurasi yang valid.
* Reward dihitung berdasarkan konfigurasi server.

### 5. Server-Side Exam Timer

Timer tidak boleh hanya berjalan pada frontend.

Backend perlu menyimpan:

* `startedAt`;
* `expiresAt`;
* `submittedAt`;
* status attempt.

Acceptance criteria:

* Jawaban setelah `expiresAt` ditolak.
* Refresh aplikasi tidak mengulang timer.
* Waktu pada perangkat user tidak memengaruhi batas ujian.
* Attempt otomatis ditutup setelah waktu habis.

### 6. Transaction dan Idempotency

Endpoint answer dan finish perlu dibuat transactional dan idempotent.

Acceptance criteria:

* Satu pertanyaan hanya dinilai satu kali.
* Request finish berulang tidak menambah XP berulang.
* Request paralel tidak menghasilkan reward ganda.
* XP, achievement, progress, dan status session disimpan dalam satu transaction.

## P1 — Authentication dan Accountability

### 7. Refresh Token dan Session Revocation

Tambahkan penyimpanan session atau refresh token di database.

Data minimal:

* session ID atau JTI;
* user ID;
* createdAt;
* expiresAt;
* revokedAt;
* lastUsedAt;
* device atau user agent.

Fitur minimal:

* logout satu perangkat;
* logout semua perangkat;
* revoke token;
* revoke otomatis setelah password berubah;
* revoke otomatis setelah akun suspended.

### 8. Validasi Role Assignment

Role assignment harus memeriksa:

* `validFrom`;
* `validUntil`;
* status user;
* scope sekolah;
* scope role.

Jangan hanya mengambil role assignment paling awal tanpa memvalidasi masa aktifnya.

Acceptance criteria:

* Role expired tidak dapat digunakan.
* Role dari sekolah lain tidak dapat mengakses resource.
* User dengan beberapa role dapat memilih active role secara eksplisit.

### 9. Audit Log

Tambahkan audit log untuk aktivitas penting:

* login berhasil dan gagal;
* registrasi;
* role assignment;
* parent claim;
* join class;
* create, update, dan delete class;
* remove student;
* perubahan profile;
* start dan finish exam;
* perubahan status akun.

Data minimal:

* actor ID;
* school ID;
* action;
* entity type;
* entity ID;
* IP address;
* user agent;
* timestamp;
* metadata.

## P2 — Frontend dan Production Readiness

### 10. Konfigurasi API URL

API URL tidak boleh hardcoded ke localhost.

Gunakan environment berbeda untuk:

* development;
* testing;
* staging;
* production.

### 11. Security Headers

Tambahkan minimal:

* Content Security Policy;
* `X-Content-Type-Options`;
* `Referrer-Policy`;
* `Permissions-Policy`;
* frame protection;
* secure cookie policy apabila token dipindahkan ke cookie.

### 12. Token Storage

Mohon evaluasi penggunaan `localStorage` untuk access dan refresh token.

Prioritas:

* refresh token disimpan menggunakan secure, HTTP-only, SameSite cookie;
* access token dibuat berumur pendek;
* jangan menyimpan refresh token jangka panjang di localStorage.

## P3 — Testing

Mohon tambahkan test berikut:

* stored-XSS test;
* privileged-role registration test;
* suspended-account access test;
* expired role-assignment test;
* parent-link expiry test;
* parent-link replay test;
* cross-school authorization test;
* one-question XP farming test;
* exam timeout test;
* duplicate-answer test;
* duplicate-finish test;
* concurrent finish request test;
* refresh-token revocation test.

Mohon pastikan jumlah test pada dokumentasi sesuai dengan hasil aktual `npm test`, karena saat ini terdapat perbedaan informasi antara 42 dan 46 test.

## Catatan Product Decision

Halaman Home tetap menggunakan menu grid.

Mohon jangan mengembalikan Home ke layout “Today”. Informasi penting seperti notification, action required, upcoming activity, dan progress dapat ditampilkan sebagai badge, card, atau summary di bawah menu grid.

## Format Pengiriman Perbaikan

Mohon setiap perbaikan dikirim melalui commit atau pull request terpisah berdasarkan kategori:

1. XSS remediation
2. Account and role provisioning
3. Parent-link security
4. Game and exam integrity
5. Session and token management
6. Audit log
7. Production configuration
8. Automated tests

Pada setiap pull request, sertakan:

* masalah yang diperbaiki;
* pendekatan solusi;
* file yang berubah;
* migration jika ada;
* test yang ditambahkan;
* hasil test;
* risiko regression;
* langkah manual verification.

Mohon push seluruh perubahan ke repository agar dapat dilakukan review ulang berdasarkan diff terbaru.
