import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
    getDatabase, onValue, push, ref, remove, runTransaction, set
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCrkzpcM7BBopIs2EqJllNz6QNqu1299gA',
    authDomain: 'spotmocity-9aa17.firebaseapp.com',
    databaseURL: 'https://spotmocity-9aa17-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'spotmocity-9aa17',
    storageBucket: 'spotmocity-9aa17.firebasestorage.app',
    messagingSenderId: '732588189317',
    appId: '1:732588189317:web:a2a4a4489b8167ff59abec'
};
const ADMIN_UID = '14qFEd82puOI53YeIMhB3wYrWZ23';
// Enable only after publishing the database rules described in README.md.
const RULES_DEPLOYED = true;
const PRICE = 100;

const form = document.getElementById('registration-form');
const registrationFields = document.getElementById('registration-fields');
const adminForm = document.getElementById('admin-form');
const adminFields = document.getElementById('admin-fields');
const entriesList = document.getElementById('entries');
const message = document.getElementById('message');
const adminMessage = document.getElementById('admin-message');
const status = document.getElementById('connection-status');
const adminPanel = document.getElementById('admin-panel');
const adminToggle = document.getElementById('admin-toggle');
const exportButton = document.getElementById('export');
const logoutButton = document.getElementById('logout');
const cancelEditButton = document.getElementById('cancel-edit');
let entries = [];
let isAdmin = false;
let editingId = null;
let connected = false;
let loaded = false;
let busy = false;
let authBusy = false;
let loadError = '';

function showMessage(text) {
    message.textContent = text;
}

function resetForm() {
    editingId = null;
    form.reset();
    document.getElementById('submit-entry').textContent = '加入接龍';
    cancelEditButton.hidden = true;
}

function updateAvailability() {
    registrationFields.disabled = !RULES_DEPLOYED || !connected || !loaded || busy;
    adminFields.disabled = !RULES_DEPLOYED || !connected || authBusy;
    exportButton.disabled = !loaded;
    if (!RULES_DEPLOYED) {
        status.textContent = '雲端接龍尚未啟用：請先發布安全規則，並依照網站設定說明開啟。';
    } else if (loadError) {
        status.textContent = loadError;
    } else if (!connected) {
        status.textContent = '與資料庫的連線中斷，重新連線後才能修改名單。';
    } else if (!loaded) {
        status.textContent = '正在載入雲端名單。';
    } else {
        status.textContent = '雲端名單已連線，其他訪客的更新會自動顯示。';
    }
}

function render() {
    document.getElementById('total-count').textContent = loaded
        ? entries.reduce((sum, entry) => sum + entry.count, 0) : '—';
    document.getElementById('entry-count').textContent = loaded ? `${entries.length} 筆` : '';
    document.getElementById('empty').hidden = !loaded || entries.length > 0;
    entriesList.replaceChildren();
    entries.forEach((entry, index) => {
        const item = document.createElement('li');
        item.className = 'entry';
        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${index + 1}. ${entry.name}`;
        const meta = document.createElement('div');
        meta.className = 'entry-meta';
        meta.textContent = `${entry.group} · ${entry.count} 人`;
        info.append(title, meta);
        item.append(info);
        if (isAdmin) {
            const actions = document.createElement('div');
            actions.className = 'entry-actions';
            ['編輯', '刪除'].forEach((label) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'button secondary small';
                button.textContent = label;
                button.disabled = !connected || busy;
                button.setAttribute('aria-label', `${label} ${entry.name} 的報名`);
                button.addEventListener('click', async () => {
                    if (label === '編輯') {
                        editingId = entry.id;
                        form.elements.group.value = entry.group;
                        form.elements.name.value = entry.name;
                        form.elements.count.value = entry.count;
                        document.getElementById('submit-entry').textContent = '儲存修改';
                        cancelEditButton.hidden = false;
                        showMessage('正在編輯報名資料。');
                        form.elements.group.focus();
                    } else if (confirm(`確定刪除「${entry.name}」的報名？`)) {
                        busy = true;
                        updateAvailability();
                        render();
                        try {
                            await remove(ref(database, `wine-tasting-2026/${entry.id}`));
                            if (editingId === entry.id) resetForm();
                            showMessage('已刪除報名。');
                        } catch (error) {
                            console.error('Unable to delete registration:', error);
                            showMessage('刪除失敗，請檢查網絡或管理員權限後重試。');
                        } finally {
                            busy = false;
                            updateAvailability();
                            render();
                        }
                    }
                });
                actions.append(button);
            });
            item.append(actions);
        }
        entriesList.append(item);
    });
    exportButton.hidden = !isAdmin;
    adminForm.hidden = isAdmin;
    logoutButton.hidden = !isAdmin;
    updateAvailability();
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const registrations = ref(database, 'wine-tasting-2026');

if (RULES_DEPLOYED) {
    onValue(ref(database, '.info/connected'), (snapshot) => {
        connected = snapshot.val() === true;
        updateAvailability();
        render();
    });
    onValue(registrations, (snapshot) => {
        const updated = [];
        let invalid = false;
        snapshot.forEach((child) => {
            const value = child.val();
            if (!value || typeof value.group !== 'string' || typeof value.name !== 'string' ||
                !Number.isInteger(value.count) || value.count < 1 || value.count > 1000) {
                invalid = true;
                return;
            }
            updated.push({ id: child.key, group: value.group, name: value.name, count: value.count });
        });
        if (invalid) {
            entries = [];
            loaded = false;
            loadError = '雲端名單包含無效資料，請管理員檢查資料庫；暫時無法顯示或修改名單。';
        } else {
            entries = updated;
            loaded = true;
            loadError = '';
        }
        render();
    }, (error) => {
        console.error('Unable to read registrations:', error);
        entries = [];
        loaded = false;
        loadError = '無法讀取雲端名單，請檢查資料庫規則及網絡設定。';
        render();
    });
    onAuthStateChanged(auth, (user) => {
        isAdmin = !!user && user.uid === ADMIN_UID;
        if (!isAdmin && editingId !== null) resetForm();
        render();
    }, (error) => {
        console.error('Unable to observe authentication:', error);
        adminMessage.textContent = '無法確認登入狀態，請檢查網絡後重試。';
        isAdmin = false;
        render();
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!RULES_DEPLOYED || !connected || !loaded || busy) return;
    const group = form.elements.group.value.trim();
    const name = form.elements.name.value.trim();
    const count = Number(form.elements.count.value);
    if (!group || !name || !Number.isInteger(count) || count < 1 || count > 1000) {
        showMessage('請輸入群名、名字，以及 1 至 1000 的整數人數。');
        return;
    }
    if (editingId !== null && !isAdmin) {
        showMessage('請先以管理員帳號登入。');
        return;
    }
    const currentId = editingId;
    const entry = { group, name, count };
    busy = true;
    updateAvailability();
    render();
    try {
        if (currentId === null) {
            await set(push(registrations), entry);
        } else {
            const result = await runTransaction(ref(database, `wine-tasting-2026/${currentId}`),
                (current) => current === null ? undefined : entry);
            if (!result.committed) {
                showMessage('此報名已不存在，請取消編輯後重試。');
                return;
            }
        }
        showMessage(currentId === null ? '已加入接龍！' : '已儲存修改。');
        resetForm();
    } catch (error) {
        console.error('Unable to save registration:', error);
        showMessage('儲存失敗，請檢查網絡或資料庫權限後重試。');
    } finally {
        busy = false;
        updateAvailability();
        render();
    }
});

cancelEditButton.addEventListener('click', () => {
    resetForm();
    showMessage('已取消編輯。');
});
adminToggle.addEventListener('click', () => {
    adminPanel.hidden = !adminPanel.hidden;
    adminToggle.setAttribute('aria-expanded', String(!adminPanel.hidden));
});
adminForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!RULES_DEPLOYED || !connected || authBusy) return;
    authBusy = true;
    updateAvailability();
    try {
        const credential = await signInWithEmailAndPassword(
            auth, adminForm.elements.email.value.trim(), adminForm.elements.password.value
        );
        adminForm.reset();
        if (credential.user.uid !== ADMIN_UID) {
            await signOut(auth);
            adminMessage.textContent = '此帳號沒有管理員權限。';
        } else {
            adminMessage.textContent = '已進入管理模式。';
        }
    } catch (error) {
        console.error('Unable to sign in:', error);
        adminMessage.textContent = '登入失敗，請檢查帳號、密碼及網絡連線。';
    } finally {
        adminForm.elements.password.value = '';
        authBusy = false;
        updateAvailability();
    }
});
logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        resetForm();
        showMessage('');
        adminMessage.textContent = '已登出管理模式。';
    } catch (error) {
        console.error('Unable to sign out:', error);
        adminMessage.textContent = '登出失敗，請重試。';
    }
});
exportButton.addEventListener('click', () => {
    if (!isAdmin || !loaded) return;
    const cell = (value) => {
        let text = String(value);
        if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
        ['群名', '名字', '人數', '應收金額 (MOP)'],
        ...entries.map((entry) => [entry.group, entry.name, entry.count, entry.count * PRICE])
    ];
    const csv = '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '品酒坊接龍名單.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateAvailability();
