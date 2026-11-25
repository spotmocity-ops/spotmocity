(() => {
    const list = document.getElementById('wine-registration-list');
    const status = document.getElementById('wine-registration-status');
    const entriesCount = document.getElementById('wine-count-entries');
    const peopleCount = document.getElementById('wine-count-people');
    let generation = 0;
    let unsubscribe = [];

    function clear() {
        list.replaceChildren();
        entriesCount.textContent = '—';
        peopleCount.textContent = '—';
    }

    function stop() {
        generation += 1;
        unsubscribe.forEach(cancel => cancel());
        unsubscribe = [];
        clear();
        status.textContent = '選擇此分頁以載入報名資料。';
    }

    function render(entries) {
        entriesCount.textContent = entries.length;
        peopleCount.textContent = entries.reduce((sum, entry) => sum + entry.count, 0);
        list.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'rounded-lg bg-white p-6 text-center text-sm text-slate-500';
            empty.textContent = '目前尚未有人報名。';
            list.append(empty);
            return;
        }
        entries.forEach((entry, index) => {
            const card = document.createElement('article');
            card.className = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
            const title = document.createElement('p');
            title.className = 'break-words font-bold text-slate-900';
            title.textContent = `${index + 1}. ${entry.name}`;
            const details = document.createElement('p');
            details.className = 'mt-1 break-words text-sm text-slate-600';
            details.textContent = `群名：${entry.group} · ${entry.count} 人 · 應收 MOP ${entry.count * 100}`;
            card.append(title, details);
            list.append(card);
        });
    }

    async function load() {
        stop();
        const current = generation;
        status.textContent = '正在載入雲端名單…';
        let connected = false;
        let loaded = false;
        let errorMessage = '';
        const updateStatus = () => {
            if (errorMessage) status.textContent = errorMessage;
            else if (!connected) status.textContent = '與資料庫的連線中斷，等待重新連線。';
            else if (!loaded) status.textContent = '正在載入雲端名單…';
            else status.textContent = '雲端名單已連線，資料會自動更新。';
        };
        try {
            const [{ database }, { onValue, ref }] = await Promise.all([
                import('./wine-tasting-firebase.js'),
                import('https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js')
            ]);
            if (current !== generation) return;
            unsubscribe.push(onValue(ref(database, '.info/connected'), snapshot => {
                if (current !== generation) return;
                connected = snapshot.val() === true;
                updateStatus();
            }));
            unsubscribe.push(onValue(ref(database, 'wine-tasting-2026'), snapshot => {
                if (current !== generation) return;
                const entries = [];
                let invalid = false;
                snapshot.forEach(child => {
                    const entry = child.val();
                    if (!entry || typeof entry.group !== 'string' || typeof entry.name !== 'string' ||
                        !Number.isInteger(entry.count) || entry.count < 1 || entry.count > 1000) {
                        invalid = true;
                    } else {
                        entries.push(entry);
                    }
                });
                if (invalid) {
                    loaded = false;
                    errorMessage = '雲端名單包含無效資料，請檢查資料庫。';
                    clear();
                } else {
                    loaded = true;
                    errorMessage = '';
                    render(entries);
                }
                updateStatus();
            }, error => {
                if (current !== generation) return;
                console.error('Unable to read wine tasting registrations:', error);
                loaded = false;
                errorMessage = '無法讀取雲端名單，請檢查網絡或資料庫設定。';
                clear();
                updateStatus();
            }));
        } catch (error) {
            if (current !== generation) return;
            console.error('Unable to load wine tasting registrations:', error);
            clear();
            status.textContent = '無法載入雲端名單，請檢查網絡後重新選擇此分頁。';
        }
    }

    window.loadWineRegistrationsAdmin = load;
    window.stopWineRegistrationsAdmin = stop;
})();
