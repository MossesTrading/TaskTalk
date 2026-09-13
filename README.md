# TalkTask Web

Versi web dari app TalkTask, untuk dipakai dari laptop/PC kantor.
Database, aturan akses (RLS), dan akunnya **sama persis** dengan app HP —
tidak ada tabel atau SQL tambahan untuk web ini.

Isinya: Beranda (status 24 jam, suka, komentar & balas @, lonceng notifikasi),
Chat (pribadi & grup, gambar, hapus pesan, hapus chat, keluar/keluarkan anggota,
centang dibaca, status online), Task (dashboard achievement), Kontak, dan Profil.

## Menjalankan di komputer sendiri

```bash
cd web
npm install
npm run dev
```

Buka http://localhost:5173.

Isi dulu `web/.env` (lihat `.env.example`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Ambil nilainya dari Supabase Dashboard → Project Settings → API Keys.
Pakai **anon / publishable key**, jangan service_role.

## Deploy ke Vercel

1. Import project ini di Vercel, lalu set **Root Directory** ke `web`.
2. Tambah Environment Variables: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` sudah mengatur agar semua alamat diarahkan ke `index.html`
   (supaya link seperti `/chat/<id>` tidak jadi 404 saat halaman di-refresh).

## Task (dashboard achievement)

Satu **kartu per task**, diambil dari tabel `Task`. Kartu tertutup menampilkan
ringkasan sebaris (unit, OK, Repair, % repair); diklik baru melar jadi dashboard
penuh. Task baru yang ditambahkan di tabel `Task` otomatis muncul sebagai kartu,
walaupun belum ada satu pun unit yang diperiksa.

Datanya dari tabel `DATA`, dan **satu unit dihitung sekali**: kalau satu
`FrameNumber` tercatat lebih dari sekali pada task yang sama, yang dipakai adalah
entri **paling akhir** (timestamp terbesar; kalau sama, id terbesar). Entri lama
tidak dibuang diam-diam — jumlahnya muncul di "Catatan data" dan daftarnya ada di
sheet *Entri Ditimpa* pada file Excel.

Isi dashboard: achievement per jam (batang bertumpuk OK/Repair), sebaran status,
per model, per lokasi (blok atau area), per petugas, lalu catatan mutu data.
Tombol **Unduh Excel** ada di bagian bawah tiap kartu.

Rentang waktunya dipilih lewat **kalender** (`src/components/DateRangePicker.tsx`):
klik satu tanggal untuk menandai awal, klik tanggal kedua untuk menutup rentang
(dipilih mundur pun otomatis dibetulkan). Di bawah kalender ada pintasan
Hari ini / Kemarin / 7 hari / 30 hari / Semua tanggal. Tanggalnya disimpan sebagai
kunci `"YYYY-MM-DD"` menurut WIB, bukan objek `Date`, supaya tidak ada pergeseran
hari saat dibuka dari komputer berzona waktu lain — batas harinya lalu diubah ke
UTC sekali saja waktu query (awal hari inklusif, hari terakhir ikut penuh).

Jam selalu ditampilkan dalam **WIB**. Database menyimpan UTC dan Excel tidak
menyimpan timezone, jadi pergeserannya dibuat eksplisit di satu tempat
(`TZ_HOURS` di `src/lib/tasks.ts`) supaya angka di layar dan di file Excel sama —
termasuk kalau dashboardnya dibuka dari komputer yang zona waktunya bukan WIB.

File `.xlsx` ditulis sendiri di `src/lib/xlsx.ts`, tanpa library tambahan
(paket `xlsx` di npm sudah tidak dirawat dan versi terakhirnya punya advisory).
ZIP-nya memakai metode *store*, jadi filenya sedikit lebih besar tapi Excel
membukanya sama saja. Tanggal ditulis sebagai datetime Excel asli, bukan teks.

Dashboard tidak memakai realtime — datanya diambil saat halaman dibuka dan saat
tombol **Muat ulang** ditekan.

## Notifikasi

- **Notifikasi browser**: muncul walau user sedang membuka tab lain (di Windows tampil
  di pojok kanan bawah). Isinya nama pengirim + cuplikan pesan, dengan foto profil /
  foto grup sebagai ikon. Diklik → langsung membuka room chatnya.
  Izin diminta lewat tombol "Nyalakan notifikasi" di menu samping (aturan browser:
  izin hanya boleh diminta dari klik user).
- **Angka belum dibaca** tampil di judul tab ("(3) TalkTask") dan di ikon tab
  (lingkaran merah berisi angka), jadi kelihatan dari tab mana pun.
- **Notif kecil di dalam halaman** tetap dipakai saat tab TalkTask sedang aktif.

Batasnya: semua ini jalan selama tab TalkTask masih terbuka (boleh di belakang).
Kalau browsernya ditutup sama sekali, yang bekerja adalah push notif di app HP.

## Catatan soal gambar

Foto chat & status tampil kecil dengan watermark nama pembuka + jam.
Klik kanan dan seret-simpan dimatikan. Ini penanda asal, **bukan pengaman**:
di browser, apa yang tampil di layar tetap bisa di-screenshot. Watermark membuat
kebocoran bisa ditelusuri sumbernya.

## Struktur

```
src/config    URL & key Supabase (dari .env)
src/lib       lapisan data: supabase, realtime, chat, statuses, notifications,
              presence, contacts, profile, storage, tasks (dashboard),
              taskExport + xlsx (unduhan Excel)
src/context   AuthContext (sesi & profil), PresenceContext (online),
              ChatInboxContext (daftar chat, angka belum dibaca, notif chat masuk)
src/components komponen UI (Avatar, Dialog, Menu, SecureImage, ChatRoom,
              DateRangePicker, dll.)
src/pages     halaman: Masuk, Daftar, Lengkapi profil, Beranda, Chat, Task,
              Kontak, Profil
```

Catatan: lapisan `src/lib` ditulis ulang untuk browser (bukan berbagi file dengan
app HP, karena app HP memakai modul React Native). Kalau ada perubahan aturan data
di app HP, bagian yang sama di sini perlu ikut disesuaikan.
