**🌐 Language / Dil:** [English](README.md) | Türkçe

# Anchorly API

[![CI](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml/badge.svg)](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)

Görev ve alışkanlık takip uygulaması [Anchorly](https://github.com/berkaycinar-dev/Anchorly)'nin REST API'si. Görevleri, günlük rutinleri, projeleri ve ayarları PostgreSQL'de saklar; böylece veriler kullanıcıyla birlikte cihazdan cihaza taşınabilir.

> **Durum:** veri API'si tamamlandı ve test edildi. Sırada hesaplar ve giriş var; o zamana kadar her istek sabit bir geliştirme kullanıcısı adına işlenir.

---

## Özellikler

- **Ayarlar:** tema, dil, yazı tipi ve hafta başlangıcı; her biri ayrı ayrı değiştirilebilir.
- **Projeler:** ekleme, yeniden adlandırma ve silme. Proje silinince görevleri aynı transaction içinde projeden ayrılır.
- **Rutinler:** ekran sırası sunucuda tutulur; her rutin ve gün için bir işaret saklanır.
- **Görevler:** frontend'deki biçimin aynısı (tarihsiz görev için `date: ""`, `order`, adımlar). Sürükle-bırak sıralaması ve ekleme, güncelleme ve silme işlemlerini tek transaction'da çalıştıran toplu işlem uç noktası.
- **İstemcinin ürettiği ID'ler:** frontend UUID'leri çevrimdışıyken de üretir. Aynı ekleme isteği iki kez gelirse kopya oluşmaz, mevcut kayıt döner.
- **Yumuşak silme:** silinen satırlar `deleted_at` zamanıyla saklanır; cihazlar arası eşitlemeye hazır.
- **Sıkı doğrulama:** her istek gövdesi Zod ile denetlenir. Bilinmeyen alanlar reddedilir; yazım hataları sessizce kaybolmaz.
- **Tek hata biçimi:** her hata `{ "error": { "code", "message", "details" } }` biçiminde döner. İç hataların ayrıntısı dışarı sızmaz.
- **Etkileşimli belge:** `/docs` adresinde OpenAPI 3. İstekleri doğrulayan Zod şemalarının aynısından üretilir.

---

## Tasarım kararları

| Konu                | Karar                                                         | Neden                                                                                            |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Birincil anahtarlar | Kullanıcı verisinde `(user_id, id)`                           | İki kullanıcı aynı demo ID'lerini aktarabilir; bir görev başka kullanıcının projesine bağlanamaz |
| Görev adımları      | `jsonb` sütunu                                                | Adımlar her zaman göreviyle birlikte okunup yazılır                                              |
| Görev sırası        | `bigint`                                                      | Frontend yeni görevlerde `Date.now()` kullanıyor                                                 |
| İzinli değerler     | `text` + `CHECK` + Zod; `src/constants` içindeki tek listeden | Veritabanı ile API hiçbir zaman ayrışmaz                                                         |
| Rutin işaretleri    | İşaret kaldırılınca satır kalır, `checked = false` olur       | Değişiklik diğer güncellemeler gibi eşitlenebilir                                                |
| Yerel ayar          | Veritabanları yerleşik `C.UTF-8` ayarını kullanır             | `lower('I')` Türkçe Windows dahil her makinede `i` olur                                          |

---

## Kullanılan teknolojiler

- Node.js 22 ve Express 5 (JavaScript, ES modülleri)
- PostgreSQL 17, Drizzle ORM ve Drizzle Kit migration'ları
- Doğrulama ve OpenAPI belgesi için Zod 4
- Gerçek bir test veritabanına karşı Vitest ve Supertest
- ESLint, Prettier ve GitHub Actions

---

## Kurulum

### 1. Gereksinimler

- Node.js 22
- PostgreSQL 17

Sistem dili Türkçe olan Windows'ta PostgreSQL yükleyicisi `locale name "Turkish_Türkiye.1254" contains non-ASCII characters` hatasıyla yarım kalabilir. Bu durumda veritabanı kümesini `initdb --locale=C` ile kendin oluştur, sonra `pg_ctl register` ile hizmet olarak kaydet.

### 2. Rolü ve veritabanlarını oluştur

`postgres` süper kullanıcısıyla bağlan (örneğin `psql -U postgres`) ve şunları çalıştır:

```sql
CREATE ROLE anchorly WITH LOGIN PASSWORD 'bir_parola_sec';
CREATE DATABASE anchorly_dev OWNER anchorly TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
CREATE DATABASE anchorly_test OWNER anchorly TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
```

Testler, adı `_test` ile bitmeyen hiçbir veritabanına dokunmaz.

### 3. Ayarla ve çalıştır

```bash
git clone https://github.com/berkaycinar-dev/anchorly-api.git
cd anchorly-api
npm install
cp .env.example .env
cp .env.test.example .env.test
```

`.env` ve `.env.test` dosyalarında `change_me` yerine parolanı yaz, sonra:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

API'yi gezmek ve denemek için http://localhost:3000/docs adresini aç.

---

## Komutlar

| Komut                 | Ne yapar                                                   |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Sunucuyu başlatır, dosya değişince yeniden başlatır        |
| `npm start`           | Sunucuyu başlatır                                          |
| `npm run db:generate` | `src/db/schema` içindeki değişikliklerden migration üretir |
| `npm run db:migrate`  | Bekleyen migration'ları `.env`'deki veritabanına uygular   |
| `npm run db:seed`     | Geliştirme kullanıcısını ekler                             |
| `npm run db:create`   | `DATABASE_URL`'deki veritabanını oluşturur (CI kullanır)   |
| `npm run lint`        | ESLint'i çalıştırır                                        |
| `npm run format`      | Projeyi Prettier ile biçimlendirir                         |
| `npm test`            | Bütün testleri bir kez çalıştırır                          |
| `npm run test:watch`  | Testleri izleme modunda çalıştırır                         |

---

## API'ye genel bakış

| Yöntem ve adres                    | Amaç                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| `GET /health`                      | API'yi ve veritabanını kontrol eder                     |
| `GET`, `PATCH /me/settings`        | Ayarları okur ve değiştirir                             |
| `GET`, `POST /projects`            | Projeleri listeler ve ekler                             |
| `PATCH`, `DELETE /projects/{id}`   | Projeyi yeniden adlandırır ve siler                     |
| `GET`, `POST /routines`            | Rutinleri listeler ve ekler                             |
| `GET /routines/checks`             | Aktif rutinlerin işaretlerini listeler                  |
| `PATCH`, `DELETE /routines/{id}`   | Rutini yeniden adlandırır ve siler                      |
| `PUT /routines/{id}/checks/{date}` | Bir rutini o gün için işaretler ya da işareti kaldırır  |
| `GET`, `POST /tasks`               | Görevleri listeler ve ekler                             |
| `PATCH`, `DELETE /tasks/{id}`      | Görevi değiştirir ve siler                              |
| `POST /tasks/reorder`              | Sürükle-bırak sonrası sırayı kaydeder                   |
| `POST /tasks/bulk`                 | Birden çok görev işlemini tek transaction'da çalıştırır |

Her alanı ve hatayı içeren tam tarif `/docs` ve `/openapi.json` adreslerinde.

---

## Testler

- Testler gerçek bir PostgreSQL veritabanında (`anchorly_test`) çalışır. Migration'lar bir kez uygulanır, her testten önce bütün tablolar boşaltılır.
- `test/isolation.test.js` her yazma uç noktasını ikinci bir kullanıcının verisiyle dener ve güncelleme zamanlarına kadar hiçbir şeyin değişmediğini doğrular.
- `test/openapi.test.js`, belgede eksik bir route olduğunda ya da bir yanıt belgelenen biçimden saptığında başarısız olur.
- GitHub Actions her push'ta lint, biçim kontrolü ve bütün testleri PostgreSQL 17'ye karşı çalıştırır.

---

## Klasör yapısı

```text
src/
├── constants/    izinli değerler (temalar, kategoriler, tekrar kuralları) ve geliştirme kullanıcısı
├── db/
│   ├── schema/   Drizzle tablo tanımları
│   ├── client.js bağlantı havuzu
│   ├── migrations.js
│   └── seedDevUser.js
├── docs/         OpenAPI belgesi ve yanıt şemaları
├── lib/          HttpError
├── mappers/      veritabanı satırı ↔ frontend görev biçimi
├── middleware/   doğrulama, geliştirme kullanıcısı, hata yönetimi
├── routes/       her kaynak için bir Express router
├── schemas/      Zod istek şemaları
├── services/     iş kuralları ve sorgular
├── app.js        Express uygulamasını kurar
├── config.js     ortam değişkenleri
└── server.js     sunucuyu başlatır
drizzle/          üretilen SQL migration'ları
scripts/          migrate, seed, veritabanı oluşturma
test/             testler ve test yardımcıları
```

---

## Bilinen sınırlamalar

- Henüz hesap yok. Her istek `dev@anchorly.local` adına işlenir.
- Dosya ekleri kabul edilir ama yok sayılır; ayrı bir depolamaya taşınacaklar.
- Henüz istek sınırlama (rate limiting) ve güvenlik başlıkları yok.

---

## Yol haritası

- [x] Görevler, rutinler, projeler ve ayarlar için REST API
- [x] OpenAPI belgesi ve sürekli entegrasyon
- [ ] Kayıt, giriş, e-posta doğrulama ve hesap silme
- [ ] Frontend'in bağlanması ve çevrimdışı değişikliklerin eşitlenmesi
- [ ] Dosya eklerinin nesne depolamaya taşınması
- [ ] Yayına alma

---

## Lisans

Bu proje kişisel ve portföy amaçlı geliştirilmiştir.

---

**Geliştirici:** [berkaycinar-dev](https://github.com/berkaycinar-dev)
