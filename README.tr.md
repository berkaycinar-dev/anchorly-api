**🌐 Language / Dil:** [English](README.md) | Türkçe

# Anchorly API

[![CI](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml/badge.svg)](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)

Görev ve alışkanlık takip uygulaması [Anchorly](https://github.com/berkaycinar-dev/Anchorly)'nin REST API'si. Her kullanıcının görevlerini, günlük rutinlerini, projelerini ve ayarlarını PostgreSQL'de saklar; böylece veriler kullanıcıyla birlikte cihazdan cihaza taşınabilir.

> **Durum:** veri API'si, hesaplar ve giriş tamamlandı ve test edildi. Frontend bağlandı, API Render'da, PostgreSQL ise Neon'da yayında. Sırada gerçek e-posta gönderimi var.

---

## Özellikler

**Hesaplar**

- **Kayıt ve giriş:** e-posta ve parolayla. Parolalar Argon2id ile özetlenir.
- **Kısa ömürlü erişim token'ları** (JWT, 15 dakika) ve **yenilenen refresh token'lar** (30 gün, her kullanımda uzar). Eski bir refresh token tekrar kullanılırsa o cihazın oturumu kapanır.
- **Web ve mobil:** tarayıcılar refresh token'ı `HttpOnly` bir cookie'de tutar; mobil uygulama gövdede alır (bkz. [Kimlik doğrulama](#kimlik-doğrulama)).
- **E-posta doğrulama ve parola sıfırlama:** tek kullanımlık, süresi dolan bağlantılarla (24 saat ve 1 saat). Parola sıfırlanınca bütün cihazlardaki oturumlar kapanır.
- **Hesap yönetimi:** görünen adı ve parolayı değiştirme, aktif oturumları listeleme ve tek bir oturumu ya da diğer bütün cihazları kapatma, bütün verileri JSON olarak indirme, hesabı silme.
- **İstek sınırları:** giriş, kayıt, token ve parola uç noktalarında; adres başına ve gerektiği yerde e-posta ya da kullanıcı başına sayılır.

**Veriler**

- **Ayarlar:** tema, dil, yazı tipi ve hafta başlangıcı; her biri ayrı ayrı değiştirilebilir.
- **Projeler:** ekleme, yeniden adlandırma ve silme. Proje silinince görevleri aynı transaction içinde projeden ayrılır.
- **Rutinler:** ekran sırası sunucuda tutulur; her rutin ve gün için bir işaret saklanır.
- **Görevler:** frontend'deki biçimin aynısı (tarihsiz görev için `date: ""`, `order`, adımlar). Sürükle-bırak sıralaması ve ekleme, güncelleme ve silme işlemlerini tek transaction'da çalıştıran toplu işlem uç noktası.
- **İstemcinin ürettiği ID'ler:** frontend UUID'leri çevrimdışıyken de üretir. Aynı ekleme isteği iki kez gelirse kopya oluşmaz, mevcut kayıt döner.
- **Yumuşak silme:** silinen satırlar `deleted_at` zamanıyla saklanır; cihazlar arası eşitlemeye hazır.

**Her yerde**

- **Sıkı doğrulama:** her istek gövdesi Zod ile denetlenir. Bilinmeyen alanlar reddedilir; yazım hataları sessizce kaybolmaz.
- **Tek hata biçimi:** her hata `{ "error": { "code", "message", "details" } }` biçiminde döner. İç hataların ayrıntısı dışarı sızmaz.
- **Etkileşimli belge:** `/docs` adresinde OpenAPI 3. İstekleri doğrulayan Zod şemalarının aynısından üretilir.

---

## Tasarım kararları

| Konu                 | Karar                                                          | Neden                                                                                            |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Birincil anahtarlar  | Kullanıcı verisinde `(user_id, id)`                            | İki kullanıcı aynı demo ID'lerini aktarabilir; bir görev başka kullanıcının projesine bağlanamaz |
| Görev adımları       | `jsonb` sütunu                                                 | Adımlar her zaman göreviyle birlikte okunup yazılır                                              |
| Görev sırası         | `bigint`                                                       | Frontend yeni görevlerde `Date.now()` kullanıyor                                                 |
| İzinli değerler      | `text` + `CHECK` + Zod; `src/constants` içindeki tek listeden  | Veritabanı ile API hiçbir zaman ayrışmaz                                                         |
| Rutin işaretleri     | İşaret kaldırılınca satır kalır, `checked = false` olur        | Değişiklik diğer güncellemeler gibi eşitlenebilir                                                |
| Yerel ayar           | Veritabanları yerleşik `C.UTF-8` ayarını kullanır              | `lower('I')` Türkçe Windows dahil her makinede `i` olur                                          |
| Refresh token'lar    | Rastgele; veritabanında yalnızca SHA-256 özeti                 | Veritabanı sızsa bile onunla giriş yapılamaz                                                     |
| Oturumlar            | Her istekte veritabanında kontrol edilir                       | Çıkış ya da hesap silme, erişim token'ının süresi dolmasını beklemeden hemen etkili olur         |
| E-posta bağlantıları | Token adresin `#token=` kısmında, API'ye `POST` ile gönderilir | Token sunucu kayıtlarına düşmez; e-posta tarayıcıları bağlantıyı açarak token'ı harcayamaz       |
| Parolamı unuttum     | Her zaman `202`; iş yanıttan sonra yapılır                     | Ne yanıt ne de süresi, bir e-postanın kayıtlı olup olmadığını belli eder                         |

---

## Kimlik doğrulama

1. `POST /auth/register` ya da `POST /auth/login`; kullanıcıyı, bir **erişim token'ı** ve token'ın süresini döndürür.
2. Erişim token'ını `/health` ve `/auth/*` dışındaki her uç noktaya `Authorization: Bearer <token>` başlığıyla gönder.
3. Süresi dolunca (`401`) `POST /auth/refresh` ile yeni bir çift al. Eski refresh token artık çalışmaz.

| İstemci               | Refresh token nasıl taşınır                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarayıcı (varsayılan) | `anchorly_refresh` cookie'si: `HttpOnly`, `Secure`, `SameSite=Strict`, yalnızca `AUTH_COOKIE_PATH` altında. Hiçbir yanıt gövdesinde görünmez         |
| Mobil uygulama        | Girişte `X-Anchorly-Client: mobile` başlığını gönder. Token gövdede gelir; `/auth/refresh` ve `/auth/logout` isteklerinde de gövdede geri gönderilir |

E-postalar frontend'e bağlantı verir (`APP_URL/verify-email#token=…`, `APP_URL/reset-password#token=…`). Varsayılan olarak gönderilmez, sunucu konsoluna yazılır.

---

## Kullanılan teknolojiler

- Node.js 22 ve Express 5 (JavaScript, ES modülleri)
- PostgreSQL 17, Drizzle ORM ve Drizzle Kit migration'ları
- Doğrulama ve OpenAPI belgesi için Zod 4
- Argon2id (`@node-rs/argon2`), JWT (`jose`), `express-rate-limit`, e-posta için Resend
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

`.env` ve `.env.test` dosyalarında `change_me` yerine veritabanı parolanı yaz. `.env` dosyasında `JWT_SECRET` değerini de en az 32 karakterlik rastgele bir metinle değiştir; örneğin şu komutun çıktısıyla:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Sonra:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

http://localhost:3000/docs adresini aç, `POST /auth/login` ile `dev@anchorly.local` / `devpassword` olarak giriş yap, dönen `accessToken` değerini **Authorize** düğmesine yapıştır ve diğer uç noktaları dene.

Çalışan bir sunucuyu baştan sona kontrol etmek için ikinci bir terminalde `npm run smoke` çalıştır (ya da `npm run smoke -- https://api-adresin.example.com`). Betik geçici bir hesap açar; giriş, veriler, oturumlar ve çıkış adımlarından geçer ve hesabı yeniden siler.

### Ortam değişkenleri

| Değişken                   | Varsayılan                           | Amaç                                                                                                                                                                 |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3000`                               | Sunucunun portu                                                                                                                                                      |
| `DATABASE_URL`             | zorunlu                              | PostgreSQL bağlantı adresi                                                                                                                                           |
| `TRUST_PROXY`              | boş (kapalı)                         | API'nin önündeki proxy sayısı (tek bir yük dengeleyicinin arkasında `1`). İstek sınırlarında doğru istemci adresi için gerekli. `true` ve adres listeleri reddedilir |
| `JWT_SECRET`               | zorunlu                              | En az 32 karakter; erişim token'larını imzalar                                                                                                                       |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`                                | Erişim token'ının süresi (60–3600)                                                                                                                                   |
| `REFRESH_TOKEN_TTL_DAYS`   | `30`                                 | Refresh token'ın süresi, her yenilemede uzar (1–90)                                                                                                                  |
| `AUTH_COOKIE_PATH`         | `/auth`                              | Refresh cookie'sinin yolu. Tarayıcının kullandığı yol olmalı; örneğin proxy arkasında `/api/auth`                                                                    |
| `AUTH_COOKIE_SECURE`       | `true`                               | Refresh cookie'si yalnızca HTTPS üzerinden gönderilir                                                                                                                |
| `MAIL_PROVIDER`            | `console`                            | `console` e-postaları konsola yazar, `resend` gönderir                                                                                                               |
| `MAIL_FROM`                | `Anchorly <no-reply@anchorly.local>` | Gönderen adresi                                                                                                                                                      |
| `RESEND_API_KEY`           | boş                                  | `MAIL_PROVIDER=resend` iken zorunlu                                                                                                                                  |
| `APP_URL`                  | `http://localhost:5173`              | E-posta bağlantılarında kullanılan frontend adresi                                                                                                                   |

Bir değer eksik ya da geçersizse sunucu açılmaz ve hangisi olduğunu söyler.

---

## Komutlar

| Komut                 | Ne yapar                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`         | Sunucuyu başlatır, dosya değişince yeniden başlatır                                          |
| `npm start`           | Sunucuyu başlatır                                                                            |
| `npm run db:generate` | `src/db/schema` içindeki değişikliklerden migration üretir                                   |
| `npm run db:migrate`  | Bekleyen migration'ları `.env`'deki veritabanına uygular                                     |
| `npm run db:seed`     | Geliştirme kullanıcısını ekler (`dev@anchorly.local` / `devpassword`, e-postası doğrulanmış) |
| `npm run db:create`   | `DATABASE_URL`'deki veritabanını oluşturur (CI kullanır)                                     |
| `npm run lint`        | ESLint'i çalıştırır                                                                          |
| `npm run format`      | Projeyi Prettier ile biçimlendirir                                                           |
| `npm run smoke`       | Çalışan bir sunucuya karşı uçtan uca kontrol yapar                                           |
| `npm test`            | Bütün testleri bir kez çalıştırır                                                            |
| `npm run test:watch`  | Testleri izleme modunda çalıştırır                                                           |

---

## API'ye genel bakış

| Yöntem ve adres                                             | Amaç                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /health`                                               | API'yi ve veritabanını kontrol eder                                      |
| `POST /auth/register`, `POST /auth/login`                   | Hesap açar ya da giriş yapar                                             |
| `POST /auth/refresh`, `POST /auth/logout`                   | Yeni token'lar alır, bu oturumdan çıkar                                  |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | E-posta adresini doğrular, yeni bağlantı gönderir                        |
| `POST /auth/forgot-password`, `POST /auth/reset-password`   | Sıfırlama bağlantısı ister, yeni parola belirler                         |
| `GET`, `PATCH`, `DELETE /me`                                | Hesabı okur, görünen adı değiştirir, hesabı siler                        |
| `POST /me/password`                                         | Parolayı değiştirir ve diğer cihazlardan çıkış yapar                     |
| `GET`, `DELETE /me/sessions`                                | Aktif oturumları listeler, diğer bütün cihazlardan çıkış yapar           |
| `DELETE /me/sessions/{id}`                                  | Tek bir oturumu kapatır                                                  |
| `GET /me/export`                                            | Bütün verileri JSON dosyası olarak indirir (doğrulanmış e-posta gerekir) |
| `GET`, `PATCH /me/settings`                                 | Ayarları okur ve değiştirir                                              |
| `GET`, `POST /projects`                                     | Projeleri listeler ve ekler                                              |
| `PATCH`, `DELETE /projects/{id}`                            | Projeyi yeniden adlandırır ve siler                                      |
| `GET`, `POST /routines`                                     | Rutinleri listeler ve ekler                                              |
| `GET /routines/checks`                                      | Aktif rutinlerin işaretlerini listeler                                   |
| `PATCH`, `DELETE /routines/{id}`                            | Rutini yeniden adlandırır ve siler                                       |
| `PUT /routines/{id}/checks/{date}`                          | Bir rutini o gün için işaretler ya da işareti kaldırır                   |
| `GET`, `POST /tasks`                                        | Görevleri listeler ve ekler                                              |
| `PATCH`, `DELETE /tasks/{id}`                               | Görevi değiştirir ve siler                                               |
| `POST /tasks/reorder`                                       | Sürükle-bırak sonrası sırayı kaydeder                                    |
| `POST /tasks/bulk`                                          | Birden çok görev işlemini tek transaction'da çalıştırır                  |

Her alanı ve hatayı içeren tam tarif `/docs` ve `/openapi.json` adreslerinde.

---

## Testler

- Testler gerçek bir PostgreSQL veritabanında (`anchorly_test`) çalışır. Migration'lar bir kez uygulanır, her testten önce bütün tablolar boşaltılır.
- `test/isolation.test.js` her yazma uç noktasını ikinci bir kullanıcının verisiyle dener ve güncelleme zamanlarına kadar hiçbir şeyin değişmediğini doğrular. Kapsanmayan yeni bir tablo eklenirse başarısız olur.
- `test/requireAuth.test.js` belgelenen her korumalı uç noktaya token'sız istek gönderir.
- `test/openapi.test.js`, belgede eksik bir route olduğunda ya da bir yanıt belgelenen biçimden saptığında başarısız olur.
- `test/rateLimits.test.js` ve `test/trustProxy.test.js` her sınırı ve bir istemcinin sahte `X-Forwarded-For` başlığıyla sınırları atlatamadığını kontrol eder.
- `test/smoke.test.js`, `scripts/smoke.js` betiğini test sürecinde açılan gerçek bir sunucuya karşı çalıştırır.
- GitHub Actions her push'ta lint, biçim kontrolü ve bütün testleri PostgreSQL 17'ye karşı çalıştırır.

---

## Klasör yapısı

```text
src/
├── constants/    izinli değerler, istek sınırları, e-posta token süreleri, geliştirme kullanıcısı
├── db/
│   ├── schema/   Drizzle tablo tanımları
│   ├── client.js bağlantı havuzu
│   ├── migrations.js
│   └── seedDevUser.js
├── docs/         OpenAPI belgesi ve yanıt şemaları
├── lib/          hatalar, parolalar, token'lar, cookie'ler, cihaz adları
├── mail/         e-posta göndericileri (konsol, Resend) ve mesaj metinleri (TR, EN)
├── mappers/      veritabanı satırı ↔ frontend görev biçimi
├── middleware/   giriş kontrolü, doğrulanmış e-posta, istek sınırları, doğrulama, hatalar
├── routes/       her kaynak için bir Express router
├── schemas/      Zod istek şemaları
├── services/     iş kuralları ve sorgular
├── app.js        Express uygulamasını kurar
├── config.js     ortam değişkenleri
└── server.js     sunucuyu başlatır
drizzle/          üretilen SQL migration'ları
scripts/          migrate, seed, veritabanı oluşturma, duman testi
test/             testler ve test yardımcıları
```

---

## Bilinen sınırlamalar

- İstek sınırı sayaçları bellekte tutulur; sunucu yeniden başlayınca sıfırlanır ve sunucular arasında paylaşılmaz. Tek sunucu için yeterli.
- Henüz güvenlik başlıkları (`helmet`) ve CORS listesi yok. Üretimde frontend API'ye aynı kökenli bir vekil üzerinden eriştiği için CORS gerekmiyor.
- Ücretsiz barındırma planı 15 dakika istek almazsa uykuya geçer; duraklamadan sonraki ilk istek bir dakikaya kadar sürebilir.
- Gerçek bir sağlayıcı kurulana kadar e-postalar sunucu günlüğüne yazılır (`MAIL_PROVIDER=console`).
- E-posta adresi değiştirme henüz yok.
- Dosya ekleri kabul edilir ama yok sayılır; ayrı bir depolamaya taşınacaklar.

---

## Yol haritası

- [x] Görevler, rutinler, projeler ve ayarlar için REST API
- [x] OpenAPI belgesi ve sürekli entegrasyon
- [x] Kayıt, giriş, e-posta doğrulama, parola sıfırlama, oturumlar, veri dışa aktarma ve hesap silme
- [x] Frontend'in bağlanması ve çevrimdışı değişikliklerin eşitlenmesi
- [ ] Dosya eklerinin nesne depolamaya taşınması
- [x] Yayına alma (Render ve Neon, şema `render.yaml` içinde)
- [ ] Gerçek e-posta gönderimi

---

## Lisans

Bu proje kişisel ve portföy amaçlı geliştirilmiştir.

---

**Geliştirici:** [berkaycinar-dev](https://github.com/berkaycinar-dev)
