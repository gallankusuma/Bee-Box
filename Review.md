1. One-question XP farming masih mungkin

Tim sudah menutup bypass untuk unlock grade, tetapi /finish masih boleh dilakukan sebelum semua soal dijawab.

Alurnya sekarang masih bisa:

Start 10 questions
→ jawab 1 pertanyaan dengan benar
→ finish
→ dapat XP
→ totalGames +1
→ streak/achievement dapat berubah
→ ulangi

Kodenya memang menghitung xpEarned lebih dulu, kemudian tetap update:

xp
level
totalGames + 1
correctAnswers
totalQuestions
streak

baru setelah itu allQuestionsAnswered dipakai untuk menentukan GradeProgress.

Test baru bahkan secara eksplisit mengharapkan early finish:

expect(finish.status).toBe(200);

dan hanya memastikan sublevel tidak done.

Saya sarankan P0 ini belum ditutup.

Solusi paling bersih:

Regular game:
semua soal belum dijawab
→ /finish = 409 INCOMPLETE_SESSION

atau jika memang ingin tombol "Quit":

/abandon
→ status = abandoned
→ XP = 0
→ totalGames tidak bertambah
→ streak tidak berubah
→ achievement tidak diproses
→ GradeProgress tidak berubah
2. isExam masih client-controlled

Sekarang jauh lebih aman karena:

exam hanya grade ±1;
subLevel dipaksa server menjadi 1;
jumlah soal server-side;
timer server-side.

Tetapi schema masih menerima:

isExam: z.boolean().optional().default(false)

Jadi secara arsitektur belum benar-benar server-authoritative exam.

Idealnya:

{
  "examId": "ex_3"
}

kemudian backend menentukan sendiri:

isExam
grade
questionCount
duration
eligibility
attempt limit
schedule

Untuk MVP sekarang ini tidak separah sebelumnya, tetapi saya tetap tandai 🟡.

Ada 2 temuan lama yang belum disentuh commit ini
3. Refresh token browser masih keluar dalam JSON

Ini masih ada pada:

register;
login;
refresh;
teacher invite acceptance.

Contohnya login masih mengembalikan:

res.json({
    ...,
    accessToken,
    refreshToken
});

dan refresh:

res.json({
    accessToken: ...,
    refreshToken: newRefreshToken
});

Padahal Teacher Web sudah memakai HTTP-only cookie. Kalau refresh token tetap dikembalikan ke JavaScript melalui response body, manfaat HTTP-only cookie berkurang drastis.

Browser response sebaiknya tidak pernah menerima refresh token sebagai JSON.

Native mobile boleh menggunakan mekanisme berbeda.

4. Suspended account masih dapat login/refresh

requireAuth sekarang sudah bagus dan akan memblok access token suspended user.

Tetapi /login sendiri belum memeriksa:

user.status === 'ACTIVE'

dan /refresh juga hanya mengecek user ada atau tidak.

Jadi suspended user masih dapat memperoleh session/token baru, walaupun token tersebut kemudian ditolak saat mengakses protected endpoint.

Lebih benar:

login suspended → 401/403
refresh suspended → 401
suspend account → revoke seluruh Session

Test suite saat ini hanya menguji existing access token ditolak setelah suspend, belum login dan refresh suspended account.

Kesimpulan saya

Revision ini bagus dan substantif, bukan cosmetic fix. Dari tujuh bypass terakhir, sebagian besar jalur eksploit utamanya sudah ditutup.

Namun saya belum rekomendasikan menutup security review sepenuhnya. Tinggal fokus ke empat hal:

🔴 incomplete game tidak boleh menghasilkan XP/stat/reward;
🟡 ubah exam start menjadi examId server-authoritative;
🔴 refresh token browser jangan dikembalikan lewat JSON;
🟡 login/refresh harus menolak suspended account.

Selain itu, GitHub commit terbaru belum memiliki status check CI yang terpasang, jadi klaim 87 test green berasal dari commit/report tim; belum ada GitHub Actions check yang bisa saya verifikasi dari commit tersebut.

Kalau empat poin di atas dibereskan, menurut saya kita sudah bisa close fase security/game-integrity review dan lanjut ke Academic Foundation + Attendance.