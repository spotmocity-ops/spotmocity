# 2027全澳聚光日-小城舞台，人人開Show 報名系統設定

## 部署前設定

報名頁不直接讀取或寫入報名資料表。公開提交、管理員查詢與匯出均經過 `art-registration-api` Edge Function；匿名與一般登入用戶均沒有報名資料表的直接權限，避免繞過後端驗證或加密。管理員的讀取也經過 Edge Function 的 JWT 與 `public.is_admin()` 檢查。請先在 Supabase 專案設定以下 Function Secrets：

- `ART_REGISTRATION_ENCRYPTION_KEY`: 32-byte 隨機金鑰的 Base64 值。請用密碼管理器產生及保管，勿提交至 Git、前端或 SQL 檔案。
- `ART_REGISTRATION_CRON_SECRET`: 至少 32-byte 隨機值，用於驗證 pg_cron 呼叫。

例如在有 OpenSSL 的終端機產生兩個不同值：

```sh
openssl rand -base64 32
openssl rand -hex 32
```

使用 Supabase CLI 設定（請以自行產生的值取代，不要貼回程式碼）：

```sh
supabase secrets set ART_REGISTRATION_ENCRYPTION_KEY="貼上 base64 金鑰" ART_REGISTRATION_CRON_SECRET="貼上另一組隨機密鑰"
```

## 建立資料庫及排程

1. 在 Supabase SQL Editor 執行 [`art-registrations.sql`](./art-registrations.sql)。這會建立受 RLS 保護的報名表、團體成員表、匿名統計表及私有名單儲存桶。
2. 在 Supabase Vault 儲存 Edge Function URL 和與 `ART_REGISTRATION_CRON_SECRET` 完全相同的排程密鑰。每個 secret 只建立一次：

   ```sql
   select vault.create_secret(
       'https://owvsfvunlqudrhdsuqvk.supabase.co/functions/v1/art-registration-api',
       'art-registration-api-url'
   );
   select vault.create_secret('<與 ART_REGISTRATION_CRON_SECRET 相同的值>', 'art-registration-cron-secret');
   ```

3. 執行 [`art-registration-retention.sql`](./art-registration-retention.sql)。排程每小時呼叫 Edge Function；活動結束滿 14 日後，先刪除私有儲存中的加密 Excel，再將報名及成員資料刪除，僅保留匿名的報名數及參演人數統計。
4. 部署 Edge Function：

   ```sh
   supabase functions deploy art-registration-api --no-verify-jwt
   ```

   Function 關閉 Gateway JWT 強制驗證，因公開表單須可提交；Function 本身仍驗證管理員 JWT 與 `public.is_admin()` 權限。請勿在前端加入 Service Role Key 或加密金鑰。

## 報名管理員帳號

1. 在 Supabase Authentication 建立使用者並設定 Email／Password。
2. 執行 [`admin-registration-role.sql`](./admin-registration-role.sql)，新增 `full` 與 `registration` 兩種角色。
3. 在 Supabase SQL Editor 將使用者設為報名管理員：

   ```sql
   insert into public.admin_users (user_id, role)
   select id, 'registration'
   from auth.users
   where email = '報名管理員電郵'
   on conflict (user_id) do update set role = 'registration';
   ```

4. 報名管理員登入後只能看報名分頁、狀態、檔案下載及刪除操作。原有帳號若未設定角色，會預設為 `full`。

## 報名資料處理

- 證件號碼、出生日期及團體 Excel 檔在 Edge Function 以 AES-256-GCM 加密後才寫入資料庫／私有 Storage。
- 個人組與團體名單的明文證件資料只在 HTTPS 請求處理期間短暫存在記憶體。
- 保險 CSV 僅可由管理員匯出；舞台統籌 CSV 不包含個人識別欄位。
- 14 日清除會刪除線上資料表與私有 Storage 中的個人資料；Supabase 管理的備份依其保留週期到期清除，不能宣稱即時物理清除。
- 請在正式開放報名前確認海報、查詢聯絡方式、錄取方式及惡劣天氣安排，並由主辦方審閱個資聲明及活動章程。
