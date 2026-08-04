Halo Tim Development,

Setelah dilakukan review terhadap project Bee Box, untuk tahap selanjutnya kita fokus pada stabilitas, keamanan, dan kesiapan fondasi aplikasi. Untuk sementara, jangan melakukan perubahan besar pada desain Home. Keputusan final untuk halaman Home adalah menggunakan menu grid.

Berikut prioritas pekerjaan yang perlu dilakukan.

## P0 — Wajib diselesaikan terlebih dahulu

### 1. Perbaikan Stored XSS pada Teacher Web

Data seperti nama siswa, nama kelas, avatar, dan data lain dari database tidak boleh langsung dimasukkan menggunakan `innerHTML`.

Gunakan:

* `textContent`;
* DOM element creation;
* HTML escaping atau sanitization apabila HTML memang diperlukan.

Target:

* Input nama siswa yang berisi script tidak boleh dapat menjalankan JavaScript pada browser guru.
* Token login tidak boleh bisa dicuri melalui data yang dibuat pengguna.

### 2. Amankan registrasi akun dengan role khusus

Registrasi publik tidak boleh membebaskan pengguna memilih role `TEACHER` atau role dengan hak istimewa lainnya.

Arah implementasi:

* Registrasi publik hanya untuk `STUDENT` dan `PARENT`.
* Akun guru dibuat atau diundang oleh administrator sekolah.
* Tambahkan status akun seperti `PENDING`, `ACTIVE`, `SUSPENDED`, dan `REJECTED`.
* Middleware autentikasi harus memeriksa status akun aktif.

Target:

* Pengguna umum tidak dapat mendaftarkan dirinya sebagai guru.
* Akun yang dinonaktifkan tidak dapat menggunakan token lama.

### 3. Amankan proses menghubungkan orang tua dan siswa

Kode hubungan orang tua dan anak tidak boleh menjadi kode permanen yang langsung menghasilkan hubungan terverifikasi.

Arah implementasi:

* Kode memiliki masa berlaku.
* Kode hanya dapat dipakai satu kali.
* Tambahkan batas percobaan.
* Hubungan awal berstatus `PENDING`.
* Sediakan proses persetujuan atau verifikasi.
* Sediakan fitur unlink/revoke relationship.
* Catat aktivitas claim pada audit log.

Target:

* Kode lama atau kode yang sudah digunakan tidak dapat digunakan kembali.
* Orang tua dapat dihapus dari hubungan dengan siswa.
* Semua proses claim dapat ditelusuri.

### 4. Jadikan game dan ujian server-authoritative

Client tidak boleh menentukan parameter penting seperti:

* jumlah soal;
* mode ujian;
* grade;
* sublevel;
* durasi;
* reward XP.

Semua konfigurasi harus ditentukan dan diverifikasi oleh backend.

Target:

* Client tidak dapat mengirim `questionCount=1` untuk farming XP.
* Student tidak dapat membuka grade yang belum tersedia.
* Ujian tidak dapat dimulai pada level yang belum diperbolehkan.
* Reward dihitung oleh server berdasarkan aturan tetap.

### 5. Terapkan timer ujian pada server

Timer yang hanya tampil pada frontend tidak cukup.

Backend harus menyimpan:

* `startedAt`;
* `expiresAt`;
* `submittedAt`;
* status attempt.

Target:

* Jawaban setelah `expiresAt` ditolak.
* Attempt otomatis ditutup ketika waktu habis.
* Refresh browser tidak mengulang waktu ujian.
* Manipulasi waktu pada device tidak memengaruhi ujian.

### 6. Buat proses answer dan finish atomic serta idempotent

Proses menjawab dan menyelesaikan game harus menggunakan database transaction.

Target:

* Satu pertanyaan hanya dapat dinilai satu kali.
* Endpoint finish yang dipanggil berulang tidak menambahkan XP berulang.
* Concurrent request tidak menghasilkan reward ganda.
* Achievement dan XP tersimpan dalam satu transaction.

## P1 — Setelah P0 stabil

### 7. Session dan refresh-token management

Tambahkan penyimpanan refresh session di database.

Minimal data:

* session ID atau JTI;
* user ID;
* device information;
* createdAt;
* expiresAt;
* revokedAt;
* lastUsedAt.

Fitur yang diperlukan:

* logout satu perangkat;
* logout semua perangkat;
* revoke token;
* daftar perangkat aktif;
* otomatis revoke ketika password atau status akun berubah.

### 8. Audit Log

Buat model `AuditLog` untuk mencatat aktivitas penting, antara lain:

* login berhasil dan gagal;
* registrasi;
* perubahan role;
* pembuatan dan penghapusan kelas;
* student join class;
* parent claim;
* perubahan profile;
* ujian dimulai dan diselesaikan;
* perubahan permission.

Audit log minimal menyimpan:

* actor;
* action;
* entity type;
* entity ID;
* school ID;
* IP address;
* user agent;
* timestamp;
* metadata perubahan.

### 9. Perbaiki konfigurasi frontend

API URL tidak boleh hardcoded ke localhost.

Gunakan environment configuration untuk:

* development;
* testing;
* staging;
* production.

Tambahkan juga:

* Content Security Policy;
* security headers;
* secure token strategy;
* error handling yang konsisten.

## P2 — Fondasi fitur sekolah

Setelah keamanan dan integritas sistem selesai, mulai Academic Foundation:

1. Academic Year
2. Semester
3. Subject
4. Class Group
5. Course Offering
6. Teaching Assignment
7. Student Enrollment
8. Timetable

Jangan langsung membuat Attendance atau Assignment tanpa fondasi ini karena keduanya membutuhkan semester, mata pelajaran, kelas, guru, siswa, dan jadwal.

## P3 — Vertical Journey Pertama

Setelah Academic Foundation selesai, vertical journey pertama yang disarankan adalah Teacher Attendance:

1. Guru melihat jadwal mengajar.
2. Guru membuka sesi kelas.
3. Daftar siswa muncul berdasarkan enrollment.
4. Guru mengisi status kehadiran.
5. Guru menutup sesi.
6. Orang tua dapat melihat status.
7. Siswa dapat mengajukan izin.
8. Administrator dapat membuat laporan.

## Keputusan UI

Home tetap menggunakan menu grid.

Menu grid harus:

* berbeda berdasarkan role aktif;
* mengikuti permission pengguna;
* menampilkan badge jika ada tugas atau notifikasi;
* tidak menampilkan fitur yang belum tersedia;
* tidak menggunakan data dummy pada production;
* tetap sederhana walaupun jumlah modul bertambah.

Urutan pengerjaan yang diharapkan:

1. Stored XSS
2. Registrasi dan account provisioning
3. Parent–student verification
4. Game dan exam integrity
5. Transaction serta idempotency
6. Session revocation
7. Audit log
8. Academic Foundation
9. Teacher Attendance Journey

Setiap perubahan wajib dilengkapi:

* unit test;
* integration test;
* negative test;
* authorization test;
* cross-school tenant-isolation test.

Mohon jangan hanya mengejar tampilan atau penambahan menu. Setiap menu harus mempunyai proses bisnis, permission, validasi backend, audit, dan test yang lengkap.
