(() => {
    const form = document.getElementById('art-registration-form');
    const teamFields = document.getElementById('team-fields');
    const teamMemberList = document.getElementById('team-member-list');
    const manualRosterEditor = teamMemberList.parentElement;
    const addMemberButton = document.getElementById('add-team-member');
    const rosterFile = document.getElementById('team-roster-file');
    const audioFile = document.getElementById('accompaniment-audio-file');
    const videoFile = document.getElementById('accompaniment-video-file');
    const performerCount = document.getElementById('performer-count');
    const submitButton = document.getElementById('submit-registration');
    const message = document.getElementById('registration-message');
    const consent = document.getElementById('consent-agreed');
    const maxDate = new Date().toISOString().slice(0, 10);
    document.getElementById('contact-birth-date').max = maxDate;

    if (new URLSearchParams(window.location.search).get('plan') === 'crowd-dance') {
        const crowdDanceOption = form.querySelector('[name="registration-plan"][value="crowd-dance"]');
        if (crowdDanceOption) {
            crowdDanceOption.checked = true;
        }
    }

    let memberIdSequence = 0;
    let submitting = false;

    function showMessage(text, kind) {
        message.textContent = text;
        message.className = `rounded-lg p-4 text-sm ${kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`;
        message.classList.remove('hidden');
    }

    function selectedValue(name) {
        return form.querySelector(`[name="${name}"]:checked`)?.value || '';
    }

    function addTeamMember() {
        if (teamMemberList.children.length >= 1000) {
            showMessage('單團最多可登記 1,000 位成員。', 'error');
            return;
        }
        memberIdSequence += 1;
        const memberIndex = teamMemberList.children.length + 1;
        const memberId = `member-${memberIdSequence}`;
        const card = document.createElement('fieldset');
        card.className = 'rounded-lg border border-slate-200 bg-white p-3';
        card.dataset.teamMember = '';
        card.innerHTML = `
            <legend class="mb-3 flex items-center justify-between gap-2 font-semibold">
                <span>成員 ${memberIndex}</span>
                <button type="button" data-remove-member class="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50">移除此成員</button>
            </legend>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-sm font-medium">中文姓名 <span class="text-red-600">*</span>
                    <input data-member-field="chineseName" type="text" maxlength="120" required class="mt-1 w-full rounded-lg border px-3 py-2">
                </label>
                <label class="text-sm font-medium">英文姓名 <span class="text-red-600">*</span>
                    <input data-member-field="englishName" type="text" maxlength="160" required class="mt-1 w-full rounded-lg border px-3 py-2">
                </label>
                <fieldset>
                    <legend class="text-sm font-medium">性別 <span class="text-red-600">*</span></legend>
                    <div class="mt-2 flex gap-4">
                        <label class="flex items-center gap-2 text-sm"><input data-member-field="gender" type="radio" name="${memberId}-gender" value="male" required class="accent-blue-700">男</label>
                        <label class="flex items-center gap-2 text-sm"><input data-member-field="gender" type="radio" name="${memberId}-gender" value="female" required class="accent-blue-700">女</label>
                    </div>
                </fieldset>
                <label class="text-sm font-medium">出生日期 <span class="text-red-600">*</span>
                    <input data-member-field="birthDate" type="date" max="${maxDate}" required class="mt-1 w-full rounded-lg border px-3 py-2">
                </label>
                <label class="text-sm font-medium">證件類型 <span class="text-red-600">*</span>
                    <select data-member-field="documentType" required class="mt-1 w-full rounded-lg border px-3 py-2">
                        <option value="">請選擇</option>
                        <option value="macau_id">澳門居民身份證</option>
                        <option value="hong_kong_id">香港居民身份證</option>
                        <option value="passport">護照</option>
                        <option value="two_way_permit">往來港澳通行證</option>
                    </select>
                </label>
                <label class="text-sm font-medium">證件號碼 <span class="text-red-600">*</span>
                    <input data-member-field="documentNumber" type="text" maxlength="80" autocomplete="off" required placeholder="例如：1234567(8)" class="mt-1 w-full rounded-lg border px-3 py-2">
                </label>
            </div>`;
        teamMemberList.append(card);
    }

    function toggleGroupFields() {
        const isTeam = selectedValue('group-type') === 'team';
        const durationMinutes = document.getElementById('duration-minutes');
        const durationLimitLabel = document.getElementById('duration-limit-label');
        durationMinutes.max = isTeam ? '5' : '3';
        durationLimitLabel.textContent = isTeam ? '團體組限時 5 分鐘內' : '個人組限時 3 分鐘內';
        if (Number(durationMinutes.value) * 60 + Number(document.getElementById('duration-seconds').value) >
            (isTeam ? 300 : 180)) {
            durationMinutes.value = isTeam ? '5' : '3';
            document.getElementById('duration-seconds').value = '0';
        }
        teamFields.disabled = !isTeam;
        teamFields.classList.toggle('hidden', !isTeam);
        if (!isTeam) {
            teamMemberList.replaceChildren();
            rosterFile.value = '';
            performerCount.min = '1';
            performerCount.value = '1';
        } else {
            performerCount.min = '2';
            performerCount.value = '2';
            if (!rosterFile.files.length && teamMemberList.children.length === 0) {
                addTeamMember();
                addTeamMember();
            }
        }
        updateRosterMode();
    }

    function updateRosterMode() {
        const hasFile = rosterFile.files.length > 0;
        manualRosterEditor.classList.toggle('hidden', hasFile);
        addMemberButton.disabled = hasFile || teamMemberList.children.length >= 1000;
        if (hasFile) {
            teamMemberList.replaceChildren();
        } else if (selectedValue('group-type') === 'team' && teamMemberList.children.length === 0) {
            addTeamMember();
            addTeamMember();
        }
    }

    function setConditionalField(toggleId, rowId, inputId) {
        const toggle = document.getElementById(toggleId);
        const row = document.getElementById(rowId);
        const input = document.getElementById(inputId);
        const update = () => {
            row.classList.toggle('hidden', !toggle.checked);
            input.required = toggle.checked;
            if (!toggle.checked) input.value = '';
        };
        toggle.addEventListener('change', update);
        update();
    }

    setConditionalField('wireless-mic-toggle', 'wireless-mic-row', 'wireless-mic-count');
    setConditionalField('headset-mic-toggle', 'headset-mic-row', 'headset-mic-count');
    setConditionalField('instrument-mic-toggle', 'instrument-mic-row', 'instrument-mic-details');
    setConditionalField('large-props-toggle', 'large-props-row', 'large-props-details');

    function toggleAccompanimentFiles() {
        const accompaniment = selectedValue('accompaniment');
        const audioRow = document.getElementById('audio-file-row');
        const videoRow = document.getElementById('video-file-row');
        audioRow.classList.toggle('hidden', accompaniment !== 'audio');
        videoRow.classList.toggle('hidden', accompaniment !== 'video');
        audioFile.required = accompaniment === 'audio';
        videoFile.required = accompaniment === 'video';
        if (accompaniment !== 'audio') audioFile.value = '';
        if (accompaniment !== 'video') videoFile.value = '';
    }
    form.querySelectorAll('[name="accompaniment"]').forEach(input =>
        input.addEventListener('change', toggleAccompanimentFiles)
    );
    toggleAccompanimentFiles();

    const impromptuDanceCountRow = document.getElementById('impromptu-dance-count-row');
    const impromptuDanceTeamCount = document.getElementById('impromptu-dance-team-count');
    form.querySelectorAll('[name="impromptu-dance"]').forEach(input => input.addEventListener('change', () => {
        const isTeam = selectedValue('impromptu-dance') === 'team';
        impromptuDanceCountRow.classList.toggle('hidden', !isTeam);
        impromptuDanceTeamCount.required = isTeam;
        if (!isTeam) impromptuDanceTeamCount.value = '';
    }));

    document.querySelectorAll('[name="group-type"]').forEach(input => input.addEventListener('change', toggleGroupFields));
    addMemberButton.addEventListener('click', addTeamMember);
    rosterFile.addEventListener('change', () => {
        if (rosterFile.files[0] && rosterFile.files[0].size > 5 * 1024 * 1024) {
            rosterFile.value = '';
            showMessage('名單檔案不可超過 5 MB。', 'error');
        }
        updateRosterMode();
    });
    teamMemberList.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-remove-member]');
        if (!removeButton) return;
        removeButton.closest('[data-team-member]').remove();
        teamMemberList.querySelectorAll('[data-team-member]').forEach((member, index) => {
            member.querySelector(':scope > legend span').textContent = `成員 ${index + 1}`;
        });
        addMemberButton.disabled = teamMemberList.children.length >= 1000;
    });

    const otherCategory = document.getElementById('other-category');
    const otherCategoryRow = document.getElementById('other-category-row');
    form.querySelectorAll('[name="category"]').forEach(input => input.addEventListener('change', () => {
        const required = form.querySelector('[name="category"][value="other"]').checked;
        otherCategoryRow.classList.toggle('hidden', !required);
        otherCategory.required = required;
        if (!required) otherCategory.value = '';
    }));

    const description = document.getElementById('program-description');
    description.addEventListener('input', () => {
        document.getElementById('description-count').textContent = String(Array.from(description.value).length);
    });
    consent.addEventListener('change', () => {
        submitButton.disabled = !consent.checked || submitting;
    });

    function collectMembers() {
        return [...teamMemberList.querySelectorAll('[data-team-member]')].map(card => {
            const getValue = name => card.querySelector(`[data-member-field="${name}"]`).value.trim();
            return {
                chineseName: getValue('chineseName'),
                englishName: getValue('englishName'),
                gender: card.querySelector('[data-member-field="gender"]:checked')?.value || '',
                birthDate: getValue('birthDate'),
                documentType: getValue('documentType'),
                documentNumber: getValue('documentNumber')
            };
        });
    }

    function collectPayload() {
        const groupType = selectedValue('group-type');
        const registrationPlan = selectedValue('registration-plan');
        const selectedCategories = [...form.querySelectorAll('[name="category"]:checked')].map(input => input.value);
        const contact = {
            chineseName: form.elements.namedItem('contact-chinese-name').value.trim(),
            englishName: form.elements.namedItem('contact-english-name').value.trim(),
            gender: selectedValue('contact-gender'),
            birthDate: form.elements.namedItem('contact-birth-date').value,
            documentType: form.elements.namedItem('contact-document-type').value,
            documentNumber: form.elements.namedItem('contact-document-number').value.trim(),
            phone: form.elements.namedItem('contact-phone').value.trim(),
            email: form.elements.namedItem('contact-email').value.trim()
        };
        return {
            groupType,
            registrationPlan,
            ageGroup: selectedValue('age-group'),
            performanceCategories: selectedCategories,
            otherCategory: otherCategory.value.trim(),
            programTitle: form.elements.namedItem('program-title').value.trim(),
            performerCount: Number(performerCount.value),
            durationSeconds: Number(document.getElementById('duration-minutes').value) * 60 +
                Number(document.getElementById('duration-seconds').value),
            programDescription: description.value.trim(),
            contact,
            emergencyContact: {
                name: form.elements.namedItem('emergency-name').value.trim(),
                relationship: form.elements.namedItem('emergency-relationship').value.trim(),
                phone: form.elements.namedItem('emergency-phone').value.trim()
            },
            teamName: document.getElementById('team-name').value.trim(),
            teamMembers: rosterFile.files.length ? [] : collectMembers(),
            accompaniment: selectedValue('accompaniment'),
            stageRequirements: {
                impromptuDanceOption: selectedValue('impromptu-dance'),
                impromptuDanceTeamCount: impromptuDanceTeamCount.value.trim(),
                wirelessMicCount: document.getElementById('wireless-mic-toggle').checked
                    ? Number(document.getElementById('wireless-mic-count').value)
                    : 0,
                headsetMicCount: document.getElementById('headset-mic-toggle').checked
                    ? Number(document.getElementById('headset-mic-count').value)
                    : 0,
                instrumentMicDetails: document.getElementById('instrument-mic-toggle').checked
                    ? document.getElementById('instrument-mic-details').value.trim()
                    : '',
                pianoRequired: document.getElementById('piano-required').checked,
                largePropsDetails: document.getElementById('large-props-toggle').checked
                    ? document.getElementById('large-props-details').value.trim()
                    : ''
            },
            specialStageRequirements: document.getElementById('special-stage-requirements').value.trim(),
            consentAgreed: consent.checked
        };
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        message.classList.add('hidden');
        if (submitting) return;
        if (!consent.checked) {
            showMessage('請先閱讀並勾選同意聲明。', 'error');
            return;
        }
        if (!form.reportValidity()) return;

        const groupType = selectedValue('group-type');
        const selectedCategories = form.querySelectorAll('[name="category"]:checked').length;
        if (!selectedCategories) {
            showMessage('請至少選擇一項藝術表演類別。', 'error');
            return;
        }
        const duration = Number(document.getElementById('duration-minutes').value) * 60 +
            Number(document.getElementById('duration-seconds').value);
        const maximumDuration = groupType === 'individual' ? 180 : 300;
        if (duration < 1 || duration > maximumDuration) {
            showMessage(groupType === 'individual'
                ? '個人組預計演出時長須介乎 1 秒至 3 分鐘。'
                : '團體組預計演出時長須介乎 1 秒至 5 分鐘。',
                'error');
            return;
        }
        if (groupType === 'individual' && Number(performerCount.value) !== 1) {
            showMessage('個人組演出人數必須為 1 人。', 'error');
            return;
        }
        if (groupType === 'team' && !rosterFile.files.length && teamMemberList.children.length !== Number(performerCount.value)) {
            showMessage('團體組演出人數須與成員名單人數一致。', 'error');
            return;
        }
        const teamFile = rosterFile.files[0];
        if (teamFile && !teamFile.name.toLowerCase().endsWith('.xlsx')) {
            showMessage('請上傳 .xlsx 格式的 Excel 名單。', 'error');
            return;
        }
        const accompaniment = selectedValue('accompaniment');
        const audioUpload = audioFile.files[0];
        const videoUpload = videoFile.files[0];
        if (accompaniment === 'audio' && (!audioUpload ||
            !/\.(mp3|wav)$/i.test(audioUpload.name) || audioUpload.size > 50 * 1024 * 1024)) {
            showMessage('請上傳不超過 50 MB 的 MP3／WAV 伴奏檔案。', 'error');
            return;
        }
        if (accompaniment === 'video' && (!videoUpload ||
            !/\.mp4$/i.test(videoUpload.name) || videoUpload.size > 100 * 1024 * 1024)) {
            showMessage('請上傳不超過 100 MB 的 MP4 背景影片。', 'error');
            return;
        }

        submitting = true;
        submitButton.disabled = true;
        submitButton.textContent = '正在安全提交…';
        try {
            const formData = new FormData();
            formData.append('payload', JSON.stringify(collectPayload()));
            formData.append('website', document.getElementById('website').value);
            if (teamFile) formData.append('team_file', teamFile, teamFile.name);
            if (accompaniment === 'audio' && audioUpload) {
                formData.append('stage_file', audioUpload, audioUpload.name);
            }
            if (accompaniment === 'video' && videoUpload) {
                formData.append('stage_file', videoUpload, videoUpload.name);
            }
            const response = await fetch('https://owvsfvunlqudrhdsuqvk.supabase.co/functions/v1/art-registration-api', {
                method: 'POST',
                headers: {
                    apikey: 'sb_publishable_4kBnCjtv4c7j-sb8l3BrUw_j63egBDR',
                    Authorization: 'Bearer sb_publishable_4kBnCjtv4c7j-sb8l3BrUw_j63egBDR'
                },
                body: formData
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || '報名提交失敗，請稍後再試。');
            showMessage(`報名資料已安全提交，參考編號：${result.reference}。報名尚待主辦方確認。`, 'success');
            form.reset();
            teamFields.disabled = true;
            teamFields.classList.add('hidden');
            teamMemberList.replaceChildren();
            performerCount.min = '1';
            performerCount.value = '1';
            document.getElementById('description-count').textContent = '0';
            otherCategoryRow.classList.add('hidden');
            document.getElementById('audio-file-row').classList.add('hidden');
            document.getElementById('video-file-row').classList.add('hidden');
            impromptuDanceCountRow.classList.add('hidden');
            impromptuDanceTeamCount.required = false;
            audioFile.required = false;
            videoFile.required = false;
            ['wireless-mic-row', 'headset-mic-row', 'instrument-mic-row', 'large-props-row'].forEach(id =>
                document.getElementById(id).classList.add('hidden')
            );
            form.querySelectorAll('input, select, textarea, button').forEach(element => {
                element.disabled = true;
            });
            submitButton.textContent = '報名已提交';
        } catch (error) {
            showMessage(error instanceof Error ? error.message : '報名提交失敗，請稍後再試。', 'error');
            submitButton.textContent = '提交報名';
            submitButton.disabled = !consent.checked;
            submitting = false;
        }
    });

    if (Date.now() > Date.parse('2027-02-15T23:59:59+08:00')) {
        form.querySelectorAll('input, select, textarea, button').forEach(element => {
            if (element.id !== 'submit-registration') element.disabled = true;
        });
        showMessage('報名已截止。', 'error');
    }
})();
