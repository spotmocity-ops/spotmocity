# spotmocity

## 品酒坊接龍：Firebase 設定

活動頁為 `wine-tasting.html`。舊版的瀏覽器本機名單保留在原裝置，並不會上傳。

1. 在 Firebase Authentication 啟用電子郵件／密碼登入，並建立指定管理員帳號。管理員的 UID 必須與 `wine-tasting.js` 的 `ADMIN_UID` 及下列規則一致。
2. 在 Realtime Database 的「規則」頁，將 `wine-tasting-firebase-rules.json` 中 `wine-tasting-2026` 的規則合併進現有規則並發布。**不要直接覆蓋其他功能的既有規則。** 此規則允許所有訪客讀取及新增名單，只有指定 UID 可修改或刪除已有資料。群名、名字和人數因此是公開資料。
3. 確認根節點及任何上層節點沒有授予所有人寫入權限：Firebase 的上層允許規則會覆蓋較深層的限制。不要使用公開 Test mode 規則上線；如果現有規則涉及其他功能，先檢查及測試相容性。
4. 確保規則已發布及驗證後，才可在 `wine-tasting.js` 將 `RULES_DEPLOYED` 設為 `true`。規則檔只供合併參考，不會因部署靜態網頁而自動發布；若規則尚未部署，請設為 `false`。
5. 以兩個不同瀏覽器或裝置測試新增及同步；確認未登入者不能修改或刪除、指定管理員能登入及管理。Firebase 設定中的 API key 是網頁設定，不是管理員密碼；請依 Firebase 建議限制 API key 的使用範圍。

可使用 VS Code 的 Live Server 開啟 `wine-tasting.html` 預覽。部署時需包含此 HTML、`wine-tasting.js` 和 `wine-tasting-poster.jpg`；此頁並非網站的 `index.html`，公開網址需以 `/wine-tasting.html` 結尾（或依主機設定使用 `/wine-tasting`）。