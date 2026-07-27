// Shared math-question engine + grade/achievement config.
// Ported from questions.js so the backend can generate questions and
// validate answers server-side instead of trusting the client.

const QuestionEngine = {
  rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  shuffle(arr) { for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]} return arr; },

  generateOptions(correct, count=3, spread=5) {
    const opts = new Set([correct]);
    let att = 0;
    while(opts.size < count+1 && att < 50) {
      const w = correct + this.rand(-spread, spread);
      if(w !== correct) opts.add(w);
      att++;
    }
    while(opts.size < count+1) opts.add(correct + opts.size);
    return this.shuffle([...opts]);
  },

  // Question templates per grade
  templates: {
    1: [
      (r) => { const a=r(1,10),b=r(1,10); return {q:`${a} + ${b}`, ans:a+b, cat:'Penjumlahan', sp:5}; },
      (r) => { const a=r(5,18),b=r(1,a-1); return {q:`${a} - ${b}`, ans:a-b, cat:'Pengurangan', sp:5}; },
      (r) => { const a=r(1,5),b=r(1,5),c=r(1,5); return {q:`${a} + ${b} + ${c}`, ans:a+b+c, cat:'Penjumlahan', sp:5}; },
      (r) => { const a=r(10,20),b=r(1,9); return {q:`${a} - ${b}`, ans:a-b, cat:'Pengurangan', sp:6}; },
      (r) => { const a=r(5,15),b=r(1,10); return {q:`${a} + ${b}`, ans:a+b, cat:'Penjumlahan', sp:6}; },
    ],
    2: [
      (r) => { const a=r(1,5),b=r(1,5); return {q:`${a} × ${b}`, ans:a*b, cat:'Perkalian', sp:5}; },
      (r) => { const b=r(2,5),c=r(1,5); return {q:`${b*c} ÷ ${b}`, ans:c, cat:'Pembagian', sp:4}; },
      (r) => { const a=r(2,9),b=r(2,9); return {q:`${a} × ${b}`, ans:a*b, cat:'Perkalian', sp:8}; },
      (r) => { const a=r(10,50),b=r(10,50); return {q:`${a} + ${b}`, ans:a+b, cat:'Penjumlahan', sp:8}; },
      (r) => { const b=r(2,9),c=r(2,9); return {q:`${b*c} ÷ ${b}`, ans:c, cat:'Pembagian', sp:5}; },
    ],
    3: [
      (r) => { const a=r(20,80),b=r(10,50); return {q:`${a} + ${b}`, ans:a+b, cat:'Penjumlahan', sp:10}; },
      (r) => { const a=r(40,99),b=r(10,a-1); return {q:`${a} - ${b}`, ans:a-b, cat:'Pengurangan', sp:10}; },
      (r) => { const a=r(3,12),b=r(3,9); return {q:`${a} × ${b}`, ans:a*b, cat:'Perkalian', sp:10}; },
      (r) => { const b=r(2,9),c=r(2,9); return {q:`${b*c} ÷ ${b}`, ans:c, cat:'Pembagian', sp:5}; },
      (r) => { const a=r(2,6),b=r(2,6),c=r(1,10); return {q:`(${a} × ${b}) + ${c}`, ans:a*b+c, cat:'Campuran', sp:8}; },
    ],
    4: [
      (r) => { const a=r(100,500),b=r(100,500); return {q:`${a} + ${b}`, ans:a+b, cat:'Penjumlahan', sp:20}; },
      (r) => { const a=r(12,25),b=r(3,12); return {q:`${a} × ${b}`, ans:a*b, cat:'Perkalian', sp:15}; },
      (r) => { const b=r(3,12),c=r(3,15); return {q:`${b*c} ÷ ${b}`, ans:c, cat:'Pembagian', sp:6}; },
      (r) => { const gcd=(x,y)=>{while(y){[x,y]=[y,x%y]}return x}; const a=r(6,24),b=r(6,24); return {q:`FPB dari ${a} dan ${b} = ?`, ans:gcd(a,b), cat:'FPB', sp:4}; },
      (r) => { const gcd=(x,y)=>{while(y){[x,y]=[y,x%y]}return x}; const a=r(2,12),b=r(2,12); return {q:`KPK dari ${a} dan ${b} = ?`, ans:(a*b)/gcd(a,b), cat:'KPK', sp:6, input:true}; },
    ],
    5: [
      (r) => { const p=r(1,9)*10,n=r(2,20)*10; return {q:`${p}% dari ${n} = ?`, ans:p*n/100, cat:'Persen', sp:8}; },
      (r) => { const a=r(11,50),b=r(2,20); return {q:`${a} × ${b}`, ans:a*b, cat:'Perkalian', sp:30, input:true}; },
      (r) => { const s=r(3,15); return {q:`Luas persegi sisi ${s} = ? cm²`, ans:s*s, cat:'Geometri', sp:10}; },
      (r) => { const p=r(3,12),l=r(3,12); return {q:`Luas ${p} × ${l} = ? cm²`, ans:p*l, cat:'Geometri', sp:10}; },
      (r) => { const s=r(5,20); return {q:`Keliling persegi sisi ${s} = ? cm`, ans:s*4, cat:'Keliling', sp:10}; },
    ],
    6: [
      (r) => { const a=r(-20,20),b=r(-20,20); return {q:`(${a}) + (${b})`, ans:a+b, cat:'Bil. Bulat', sp:8, input:true}; },
      (r) => { const a=r(-12,12),b=r(-12,12); return {q:`(${a}) × (${b})`, ans:a*b, cat:'Bil. Bulat', sp:15, input:true}; },
      (r) => { const s=r(2,8); return {q:`Volume kubus sisi ${s} = ?`, ans:s**3, cat:'Bangun Ruang', sp:20, input:true}; },
      (r) => { const p=r(2,8),l=r(2,8),t=r(2,8); return {q:`Volume balok ${p}×${l}×${t} = ?`, ans:p*l*t, cat:'Bangun Ruang', sp:20, input:true}; },
      (r) => { const a=r(50,200),b=r(5,20); return {q:`${a} ÷ ${b} = ? (bulat)`, ans:Math.floor(a/b), cat:'Pembagian', sp:5, input:true}; },
    ],
    7: [
      (r) => { const a=r(-30,30),b=r(-30,30); return {q:`(${a}) + (${b})`, ans:a+b, cat:'Bil. Bulat', sp:10, input:true}; },
      (r) => { const a=r(-10,10),b=r(-10,10); return {q:`(${a}) × (${b})`, ans:a*b, cat:'Perkalian', sp:15, input:true}; },
      (r) => { const x=r(1,15),b=r(1,20); return {q:`x + ${b} = ${x+b}, x = ?`, ans:x, cat:'Aljabar', sp:5}; },
      (r) => { const x=r(2,10),a=r(2,6); return {q:`${a}x = ${a*x}, x = ?`, ans:x, cat:'Aljabar', sp:4}; },
      (r) => { const x=r(1,10),a=r(2,5),b=r(1,10); return {q:`${a}x + ${b} = ${a*x+b}, x = ?`, ans:x, cat:'Aljabar', sp:4, input:true}; },
    ],
    8: [
      (r) => { const x=r(1,12),a=r(2,5),b=r(1,15); return {q:`${a}x + ${b} = ${a*x+b}, x = ?`, ans:x, cat:'Pers. Linear', sp:5, input:true}; },
      (r) => { const x=r(1,8),a=r(2,4),b=r(1,10),d=r(1,5); return {q:`${a}x + ${b} = ${a*x+b-d} + ${d}, x = ?`, ans:x, cat:'Pers. Linear', sp:5, input:true}; },
      (r) => { const t=[[3,4,5],[5,12,13],[6,8,10],[8,15,17]][r(0,3)],p=r(0,2); return {q:`Pythagoras: ${p===0?'?':t[0]}, ${p===1?'?':t[1]}, ${p===2?'?':t[2]}`, ans:t[p], cat:'Pythagoras', sp:4, input:true}; },
      (r) => { const n=r(2,10); return {q:`√${n*n} = ?`, ans:n, cat:'Akar', sp:4}; },
      (r) => { const a=r(2,6),b=r(2,6); return {q:`${a}² + ${b}² = ?`, ans:a*a+b*b, cat:'Pangkat', sp:10, input:true}; },
    ],
    9: [
      (r) => { const b=r(2,8),e=r(2,3); return {q:`${b}^${e} = ?`, ans:b**e, cat:'Pangkat', sp:20, input:true}; },
      (r) => { const n=r(2,12); return {q:`√${n*n} = ?`, ans:n, cat:'Akar', sp:4}; },
      (r) => { const n=r(2,6); return {q:`³√${n**3} = ?`, ans:n, cat:'Akar³', sp:3}; },
      (r) => { const x1=r(1,8),x2=r(1,8),b=-(x1+x2),c=x1*x2; return {q:`x² ${b>=0?'+':'-'} ${Math.abs(b)}x + ${c} = 0, x = ?`, ans:Math.min(x1,x2), cat:'Kuadrat', sp:4, input:true}; },
      (r) => { const a=r(2,5),b=r(2,5),c=r(2,5); return {q:`${a}^${b} × ${a}^${c} = ${a}^?`, ans:b+c, cat:'Sifat Pangkat', sp:4}; },
    ],
  },

  generate(grade, subLevel) {
    const tmpl = this.templates[grade];
    if(!tmpl) return null;
    const idx = Math.min(subLevel-1, tmpl.length-1);
    const pool = tmpl.slice(0, idx+1);
    const raw = pool[this.rand(0, pool.length-1)](this.rand.bind(this));
    return {
      question: raw.q, answer: raw.ans, category: raw.cat,
      useInput: !!raw.input,
      options: raw.input ? null : this.generateOptions(raw.ans, 3, raw.sp||5),
      hint: raw.hint || ''
    };
  }
};

const GRADE_CONFIG = {
  1:{name:'Kelas 1 SD',school:'sd',icon:'📗',desc:'Penjumlahan & Pengurangan dasar',color:'#10b981',
    subs:[{n:'Tambah 1-10',d:'Penjumlahan kecil',i:'➕'},{n:'Kurang 1-18',d:'Pengurangan sederhana',i:'➖'},{n:'Tambah 3 Angka',d:'Tiga bilangan',i:'🧮'},{n:'Kurang Lanjut',d:'Angka lebih besar',i:'➖'},{n:'Campuran',d:'Tambah & kurang',i:'🔢'}]},
  2:{name:'Kelas 2 SD',school:'sd',icon:'📘',desc:'Perkalian & Pembagian awal',color:'#06b6d4',
    subs:[{n:'Kali 1-5',d:'Perkalian dasar',i:'✖️'},{n:'Bagi Dasar',d:'Pembagian sederhana',i:'➗'},{n:'Kali 2-9',d:'Tabel perkalian',i:'✖️'},{n:'Tambah Puluhan',d:'Angka lebih besar',i:'➕'},{n:'Bagi Lanjut',d:'Pembagian lanjut',i:'➗'}]},
  3:{name:'Kelas 3 SD',school:'sd',icon:'📙',desc:'Operasi campuran',color:'#8b5cf6',
    subs:[{n:'Tambah Puluhan',d:'20-80',i:'➕'},{n:'Kurang Puluhan',d:'40-99',i:'➖'},{n:'Kali Lanjut',d:'3-12',i:'✖️'},{n:'Bagi Lanjut',d:'Pembagian',i:'➗'},{n:'Campuran',d:'Semua operasi',i:'🧮'}]},
  4:{name:'Kelas 4 SD',school:'sd',icon:'📕',desc:'FPB, KPK & Pecahan',color:'#ec4899',
    subs:[{n:'Tambah Ratusan',d:'100-500',i:'➕'},{n:'Kali Besar',d:'2 digit',i:'✖️'},{n:'Bagi Besar',d:'Angka besar',i:'➗'},{n:'FPB',d:'Faktor persekutuan',i:'🔢'},{n:'KPK',d:'Kelipatan',i:'🔢'}]},
  5:{name:'Kelas 5 SD',school:'sd',icon:'📓',desc:'Desimal, Persen & Geometri',color:'#f59e0b',
    subs:[{n:'Persen',d:'Hitung persen',i:'💯'},{n:'Kali 2 Digit',d:'Perkalian besar',i:'✖️'},{n:'Luas Persegi',d:'s × s',i:'⬛'},{n:'Luas P.Panjang',d:'p × l',i:'▬'},{n:'Keliling',d:'Bangun datar',i:'📐'}]},
  6:{name:'Kelas 6 SD',school:'sd',icon:'📔',desc:'Bilangan bulat & Bangun ruang',color:'#ef4444',
    subs:[{n:'Bil. Bulat +',d:'Negatif',i:'🔢'},{n:'Bil. Bulat ×',d:'Kali negatif',i:'✖️'},{n:'Vol. Kubus',d:'s³',i:'📦'},{n:'Vol. Balok',d:'p×l×t',i:'📦'},{n:'Bagi Besar',d:'Ratusan',i:'➗'}]},
  7:{name:'Kelas 7 SMP',school:'smp',icon:'📚',desc:'Aljabar dasar',color:'#3b82f6',
    subs:[{n:'Bil. Bulat',d:'Operasi negatif',i:'🔢'},{n:'Kali Negatif',d:'× negatif',i:'✖️'},{n:'Aljabar +',d:'x + b = c',i:'🔤'},{n:'Aljabar ×',d:'ax = b',i:'🔤'},{n:'Aljabar Mix',d:'ax + b = c',i:'📝'}]},
  8:{name:'Kelas 8 SMP',school:'smp',icon:'📖',desc:'Persamaan & Pythagoras',color:'#8b5cf6',
    subs:[{n:'Pers. Linear',d:'ax + b = c',i:'📝'},{n:'Pers. Lanjut',d:'Dua ruas',i:'📝'},{n:'Pythagoras',d:'a² + b² = c²',i:'📐'},{n:'Akar Kuadrat',d:'√n',i:'√'},{n:'Pangkat',d:'a² + b²',i:'²'}]},
  9:{name:'Kelas 9 SMP',school:'smp',icon:'🎓',desc:'Pangkat, Akar & Kuadrat',color:'#ec4899',
    subs:[{n:'Pangkat',d:'Berpangkat',i:'²'},{n:'Akar Kuadrat',d:'√n²',i:'√'},{n:'Akar³',d:'³√n³',i:'³√'},{n:'Pers. Kuadrat',d:'x² + bx + c = 0',i:'📝'},{n:'Sifat Pangkat',d:'aⁿ × aᵐ',i:'📊'}]},
};

const ACHIEVEMENTS = [
  {id:'first',n:'Langkah Pertama',d:'Main 1 game',i:'🎮',cond:(s,h)=>s.totalGames>=1},
  {id:'ten',n:'Pemain Setia',d:'Main 10 game',i:'🏅',cond:(s,h)=>s.totalGames>=10},
  {id:'perfect',n:'Sempurna!',d:'Skor sempurna',i:'💎',cond:(s,h)=>h.accuracy===100},
  {id:'s5',n:'On Fire!',d:'Streak 5',i:'🔥',cond:(s,h)=>s.maxStreak>=5},
  {id:'s10',n:'Unstoppable',d:'Streak 10',i:'⚡',cond:(s,h)=>s.maxStreak>=10},
  {id:'fast',n:'Kilat!',d:'Jawab cepat',i:'⏱️',cond:(s,h)=>h.duration<=20},
];

// Mirrors game.js getTimeLimit() - per-question countdown for regular play.
function getTimeLimit(grade) {
  return grade <= 3 ? 30 : grade <= 6 ? 20 : 15;
}

// Mirrors game.js regenerateExams() duration field - whole-exam countdown.
function getExamDuration(grade) {
  return grade <= 3 ? 60 : grade <= 6 ? 90 : 120;
}

module.exports = { QuestionEngine, GRADE_CONFIG, ACHIEVEMENTS, getTimeLimit, getExamDuration };
