# Unlimited Private Cloud
Dengan menggabungkan Cloudflare Worker (API Gateway), Cloudflare D1 (Database SQL berkecepatan tinggi), Cloudflare KV (Cache & Token Manager), serta Dashboard Frontend minimalis, Anda kini memiliki solusi penyimpanan privat cloud berbasis Telegram yang sepenuhnya fungsional, aman, mendukung banyak akun, serta bebas biaya bulanan!

## Project Documentation
### 1. System Requirements (Kebutuhan Sistem)
 * Akun Cloudflare: Gratis (Free Tier mencakup Workers, D1 Database, dan KV Namespace).
 * Node.js & Wrangler CLI: Terinstal di komputer lokal untuk keperluan deployment kode ke Cloudflare.
 * Telegram Bot Token: Dibuat melalui @BotFather.
 * Telegram Channel / Group ID: Channel atau grup tempat file fisik disimpan, di mana bot diposisikan sebagai Administrator.
### 2. Langkah Instalasi & Deployment (Installation Guide)
#### Langkah A: Inisialisasi Proyek Cloudflare Worker
 * Buat direktori baru dan masuk ke dalam folder tersebut:
```bash
mkdir telegram-cloud-storage && cd telegram-cloud-storage
```
 * Inisialisasi proyek wrangler baru:
```bash
npx wrangler init
```
Pilih JavaScript, dan konfigurasikan file wrangler.toml sesuai kebutuhan.
#### Langkah B: Konfigurasi Database D1 & KV Cache
 * Buat database D1 SQLite:
```bash
npx wrangler d1 create telegram_db
```
   Salin database_id yang muncul dan masukkan ke wrangler.toml:
```toml
[[d1_databases]]
binding = "DB"
database_name = "telegram_db"
database_id = "MASUKKAN_DATABASE_ID_DISINI"
```
 * Buat KV Namespace untuk Cache Download:
```bash
npx wrangler kv:namespace create "CACHE_KV"
```
   Masukkan id KV ke dalam wrangler.toml:
```toml
[[kv_namespaces]]
binding = "CACHE_KV"
id = "MASUKKAN_KV_ID_DISINI"
```
 * Jalankan migrasi struktur database (schema.sql) ke D1 Cloudflare:
```bash
npx wrangler d1 execute telegram_db --local --file=schema.sql     # Untuk pengujian lokal
npx wrangler d1 execute telegram_db --remote --file=schema.sql    # Untuk produksi di Cloudflare
```
#### Langkah C: Menetapkan Secret Key (Keamanan API)
Simpan kata sandi rahasia untuk autentikasi API:
```bash
npx wrangler secret put API_SECRET_KEY
```
##### Masukkan password rahasia Anda ketika diminta

#### Langkah D: Deploy Worker
```bash
npx wrangler deploy
```
### 3. Dokumentasi API Endpoint (API Reference)
Semua endpoint (kecuali root /) wajib menyertakan header otentikasi:
Authorization: Bearer <API_SECRET_KEY>
```
| Method | Endpoint | Deskripsi & Parameter |
|---|---|---|
| POST | /account/login | Mendaftarkan akun bot baru.
Body (JSON): {"account_id": "nama_alias", "bot_token": "...", "chat_id": "..."} |
| GET | /accounts | Melihat daftar seluruh akun bot yang aktif. |
| POST | /account/logout | Menghapus akun bot dari sistem.
Body (JSON): {"account_id": "nama_alias"} |
| POST | /upload | Mengunggah file ke Telegram.
Form-Data: file (File binary), account_id (String) |
| GET | /files | Melihat daftar file dengan Pagination, Filter, & Search.
Query Params: account_id, filter (ext/all), search, page, maxview |
| PUT | /files | Mengubah nama file (Rename).
Body (JSON): {"file_id": "...", "new_file_name": "..."} |
| DELETE | /files | Menghapus file dari indeks database & pesan fisik di Telegram.
Body (JSON): {"file_id": "..."} |
| GET | /download | Mengunduh file atau menampilkan thumbnail.
Query Params: account_id, file_id, type=thumb (opsional untuk gambar kecil) |
```

        