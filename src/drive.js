/**
 * VoyaGen Google Drive API v3 整合與 Dashboard 模組
 * 處理資料夾建立、檔案讀寫、公開分享與儀表板卡片渲染
 */

const FOLDER_NAME = 'VoyaGen_Itineraries';
let cachedFolderId = null;

// 1. 取得或自動建立專屬 App 資料夾
async function getOrCreateAppFolder() {
    if (cachedFolderId) return cachedFolderId;

    const token = voyaAuth.getAccessToken();
    if (!token) throw new Error('尚未取得有效的 Google 登入 Token');

    // 搜尋是否已有該資料夾
    const query = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    const res = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Google Drive API 錯誤: ${res.status}`);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
        cachedFolderId = data.files[0].id;
        makeFilePublic(cachedFolderId, token);
        return cachedFolderId;
    }

    // 若無，則建立新資料夾
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const metadata = {
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
    };

    const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!createRes.ok) throw new Error(`建立資料夾失敗: ${createRes.status}`);
    const newFolder = await createRes.json();
    cachedFolderId = newFolder.id;
    makeFilePublic(cachedFolderId, token);
    return cachedFolderId;
}

// 輔助函式：將 Google Drive 檔案/資料夾設為公開唯讀
async function makeFilePublic(fileId, token) {
    if (!fileId || !token) return;
    try {
        const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
        const res = await fetch(permUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                role: 'reader',
                type: 'anyone',
                allowFileDiscovery: false
            })
        });
        
        if (!res.ok) {
            const errText = await res.text();
            console.error(`❌ 設定公開權限失敗 (${fileId}) HTTP ${res.status}:`, errText);
        } else {
            console.log(`✅ 成功將檔案 ${fileId} 權限設為公開唯讀 (anyone reader)`);
        }
    } catch (e) {
        console.error(`設定公開權限例外 (${fileId}):`, e);
    }
}

// 2. 讀取資料夾內的所有行程 JSON 檔案
async function listItineraries() {
    const token = voyaAuth.getAccessToken();
    if (!token) return [];

    const folderId = await getOrCreateAppFolder();
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,modifiedTime,webViewLink)&orderBy=modifiedTime desc`;

    const res = await fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`撈取行程失敗: ${res.status}`);
    const data = await res.json();
    const files = data.files || [];

    // 背景批次確保所有資料夾內的行程檔案皆具備公開唯讀權限
    files.forEach(file => makeFilePublic(file.id, token));

    return files;
}

// 3. 將行程 JSON 儲存或更新至 Google Drive (同名檔案自動覆蓋，保持原有 File ID 與分享網址)
async function saveItineraryToDrive(fileNameOrData, itineraryDataParam = null, existingFileId = null) {
    const token = voyaAuth.getAccessToken();
    if (!token) throw new Error('請先登入 Google 帳號才能儲存至雲端硬碟');

    let itineraryData;
    let fileName;

    if (itineraryDataParam === null) {
        itineraryData = fileNameOrData;
        fileName = (itineraryData && itineraryData.meta && itineraryData.meta.title) ? itineraryData.meta.title : 'itinerary';
    } else {
        fileName = fileNameOrData;
        itineraryData = itineraryDataParam;
    }

    const folderId = await getOrCreateAppFolder();
    const safeFileName = (fileName.endsWith('.yaml') || fileName.endsWith('.yml') || fileName.endsWith('.json'))
        ? fileName
        : `${fileName}.yaml`;

    const isYaml = safeFileName.endsWith('.yaml') || safeFileName.endsWith('.yml');
    const contentText = (typeof itineraryData === 'string')
        ? itineraryData
        : (window.voyaYaml ? window.voyaYaml.dumpYaml(itineraryData) : JSON.stringify(itineraryData, null, 2));

    // 檢查是否已有相同檔名的檔案
    let targetFileId = existingFileId;
    if (!targetFileId) {
        const query = encodeURIComponent(`'${folderId}' in parents and name='${safeFileName}' and trashed=false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.files && searchData.files.length > 0) {
                targetFileId = searchData.files[0].id;
            }
        }
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
        name: safeFileName,
        mimeType: isYaml ? 'text/yaml' : 'application/json'
    };
    if (!targetFileId) {
        metadata.parents = [folderId];
    }

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${isYaml ? 'text/yaml' : 'application/json'}; charset=UTF-8\r\n\r\n` +
        contentText +
        close_delim;

    let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
    let method = 'POST';

    if (targetFileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart&fields=id,name,webViewLink`;
        method = 'PATCH';
    }

    const uploadRes = await fetch(uploadUrl, {
        method: method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartRequestBody
    });

    if (!uploadRes.ok) throw new Error(`儲存檔案失敗: ${uploadRes.status}`);
    const file = await uploadRes.json();

    // 確保權限設為「公開唯讀 (anyone reader)」
    await makeFilePublic(file.id, token);

    // 直連下載/讀取網址
    const directUrl = `https://docs.google.com/uc?export=download&id=${file.id}`;
    return {
        fileId: file.id,
        fileName: file.name,
        directUrl: directUrl,
        shareUrl: `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(directUrl)}`
    };
}

// 4. 刪除檔案 (移至垃圾桶)
async function deleteItineraryFromDrive(fileId) {
    const token = voyaAuth.getAccessToken();
    if (!token) return;

    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`刪除失敗: ${res.status}`);
    await renderDashboard();
}

// 5. 渲染 Dashboard 儀表板
async function renderDashboard() {
    const container = document.getElementById('dashboard-list');
    if (!container) return;

    if (!voyaAuth.isLoggedIn()) {
        container.innerHTML = `
            <div class="border-2 border-dashed border-slate-200 rounded-3xl p-8 md:p-10 text-center bg-white/50 col-span-full">
                <div class="w-14 h-14 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4 text-xl">
                    <i class="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <h3 class="font-black text-slate-900 text-2xl mb-2">尚未連結 Google Drive 帳號</h3>
                <p class="text-sm text-slate-500 max-w-md mx-auto mb-6">登入 Google 帳號授權後，系統將為您建立專屬行程雲端資料夾，並列出所有行程。</p>
                
                <!-- Warning Banner -->
                <div class="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left text-xs text-amber-800 space-y-1.5 leading-relaxed max-w-md mx-auto">
                    <div class="font-bold flex items-center gap-1.5 text-amber-900 text-sm">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>安全性說明與提示</span>
                    </div>
                    <p>
                        ⚠️ <strong>未經過 Google 驗證提示</strong>：本應用程式目前未向 Google 提交正式審核（受限於 Google 針對 Google Drive 存取權限的複雜驗證門檻）。
                    </p>
                    <p>
                        當您點擊下方登入時，Google 會顯示「此應用程式未經 Google 驗證」的安全警示畫面。<strong>如果您有任何疑慮，請勿登入授權。</strong>如欲繼續使用，請點選該畫面左下角的「<strong>進階 (Advanced)</strong>」，並選擇「<strong>前往 VoyaGen (不安全)</strong>」以完成授權。
                    </p>
                </div>

                <button onclick="voyaAuth.login()" class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-md">
                    立即登入 Google 帳號
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
            <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 block text-indigo-600"></i>
            <span class="text-xs font-medium">讀取 Google Drive 行程庫中...</span>
        </div>
    `;

    try {
        const files = await listItineraries();

        if (files.length === 0) {
            container.innerHTML = `
                <div class="border border-slate-200 rounded-2xl p-8 text-center bg-white col-span-full">
                    <div class="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3 text-lg">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <h3 class="font-bold text-slate-800 text-base mb-1">雲端資料夾空空如也</h3>
                    <p class="text-xs text-slate-500 max-w-md mx-auto mb-4">您在 Google Drive 的 VoyaGen_Itineraries 資料夾中尚無行程。立即點擊下方按鈕開始生成第一個 AI 行程吧！</p>
                    <button onclick="navigateTo('generator')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-2">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> 建立第一個行程
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = files.map(file => {
            const fileDirectUrl = `https://docs.google.com/uc?export=download&id=${file.id}`;
            const shareUrl = `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(fileDirectUrl)}`;
            const modifiedDate = new Date(file.modifiedTime).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

            return `
                <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <input type="checkbox" class="dashboard-checkbox rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer shrink-0" data-file-id="${file.id}" onchange="voyaDrive.onCheckboxChange()">
                                <h3 class="font-bold text-slate-800 text-base truncate" title="${file.name.replace(/\.(json|yaml|yml)$/i, '')}">
                                    <a href="${shareUrl}" class="hover:text-blue-600 transition-colors cursor-pointer">${file.name.replace(/\.(json|yaml|yml)$/i, '')}</a>
                                </h3>
                            </div>
                        </div>
                        <p class="text-xs text-slate-400 mb-4 flex items-center gap-1 pl-6">
                            <i class="fa-regular fa-clock"></i>
                            最後更新：${modifiedDate}
                        </p>
                    </div>

                    <div class="flex items-center justify-between pt-3 border-t border-slate-100 gap-1.5 flex-wrap">
                        <a href="${shareUrl}" class="flex-grow bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/80 text-xs font-extrabold px-2.5 py-2 rounded-xl text-center transition-all flex items-center justify-center gap-1.5 shadow-sm h-8">
                            <i class="fa-solid fa-folder-open text-xs"></i>
                            <span>開啟行程</span>
                        </a>
                        <button onclick="voyaDrive.downloadJsonFromDashboard('${file.id}', '${file.name}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 w-8 h-8 rounded-xl transition-all flex items-center justify-center text-xs shadow-sm animate-fade-in" data-tooltip="下載 YAML">
                            <i class="fa-solid fa-file-code"></i>
                        </button>
                        <button onclick="voyaDrive.exportPdfFromDashboard('${file.id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 w-8 h-8 rounded-xl transition-all flex items-center justify-center text-xs shadow-sm animate-fade-in" data-tooltip="匯出 PDF">
                            <i class="fa-solid fa-file-pdf"></i>
                        </button>
                        <button onclick="navigator.clipboard.writeText('${shareUrl}'); voyaDrive.showToast('已複製分享網址！', 'success');" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200/80 w-8 h-8 rounded-xl transition-all flex items-center justify-center text-xs shadow-sm" data-tooltip="複製分享連結">
                            <i class="fa-solid fa-share-nodes"></i>
                        </button>
                        <button onclick="if(confirm('確定要將此行程移至垃圾桶嗎？')) voyaDrive.deleteItineraryFromDrive('${file.id}')" class="bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/80 w-8 h-8 rounded-xl transition-all flex items-center justify-center text-xs shadow-sm" data-tooltip="刪除行程">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // 初始化批次列狀態
        onCheckboxChange();

    } catch (err) {
        console.error('載入儀表板失敗:', err);
        const isAuthError = err.message.includes('401') || err.message.includes('403');
        container.innerHTML = `
            <div class="border-2 border-dashed ${isAuthError ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'} rounded-2xl p-8 text-center col-span-full">
                <div class="w-12 h-12 rounded-full ${isAuthError ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center mx-auto mb-3 text-lg">
                    <i class="fa-solid ${isAuthError ? 'fa-lock' : 'fa-circle-exclamation'}"></i>
                </div>
                <h3 class="font-bold text-slate-800 text-base mb-1">${isAuthError ? 'Google Drive 授權已過期或失效' : '讀取雲端資料夾失敗'}</h3>
                <p class="text-xs text-slate-500 max-w-md mx-auto mb-2">${isAuthError ? '請點擊下方按鈕重新完成 Google 帳號授權連線。' : err.message}</p>
                <p class="text-[10px] text-amber-600 max-w-md mx-auto mb-4 leading-normal">⚠️ 本專案為開源工具，目前未提交 Google 官方審核。登入時會跳出安全警告。如有疑慮請勿登入；如欲繼續使用，可於警告頁面點選「進階 ➡️ 前往 VoyaGen (不安全)」進行授權。</p>
                <button onclick="voyaAuth.login()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm">
                    <svg class="w-4 h-4 inline-block mr-1.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    重新連結 Google 帳號
                </button>
            </div>
        `;
    }
}

/**
 * 批次勾選與動作控制
 */
function onCheckboxChange() {
    const checkboxes = Array.from(document.querySelectorAll('.dashboard-checkbox'));
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    const countLabel = document.getElementById('selected-count-label');
    const selectAllCb = document.getElementById('select-all-checkbox');
    
    const btns = [
        document.getElementById('batch-download-btn'),
        document.getElementById('batch-export-btn'),
        document.getElementById('batch-delete-btn')
    ];

    if (checkedCount > 0) {
        if (countLabel) {
            countLabel.innerText = `已選擇 ${checkedCount} 個行程`;
            countLabel.classList.remove('text-slate-500');
            countLabel.classList.add('text-slate-800');
        }
        btns.forEach(btn => {
            if (btn) {
                btn.removeAttribute('disabled');
                btn.classList.remove('opacity-50', 'pointer-events-none', 'cursor-not-allowed');
            }
        });
    } else {
        if (countLabel) {
            countLabel.innerText = `請勾選行程進行批次操作`;
            countLabel.classList.remove('text-slate-800');
            countLabel.classList.add('text-slate-500');
        }
        btns.forEach(btn => {
            if (btn) {
                btn.setAttribute('disabled', 'true');
                btn.classList.add('opacity-50', 'pointer-events-none', 'cursor-not-allowed');
            }
        });
    }

    if (selectAllCb) {
        selectAllCb.checked = (checkboxes.length > 0 && checkedCount === checkboxes.length);
    }
}

function toggleSelectAll(isChecked) {
    const checkboxes = document.querySelectorAll('.dashboard-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    onCheckboxChange();
}

async function deleteSelectedItineraries() {
    const checkedBoxes = Array.from(document.querySelectorAll('.dashboard-checkbox:checked'));
    if (checkedBoxes.length === 0) return;

    if (!confirm(`確定要將選取的 ${checkedBoxes.length} 個行程移至垃圾桶嗎？`)) return;

    const token = voyaAuth.getAccessToken();
    if (!token) return;

    showToast(`正在批次刪除 ${checkedBoxes.length} 個行程...`, 'info', 5000);

    let deletedCount = 0;
    for (const cb of checkedBoxes) {
        const fileId = cb.getAttribute('data-file-id');
        if (fileId) {
            try {
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                deletedCount++;
            } catch (err) {
                console.warn(`刪除行程 ${fileId} 失敗:`, err);
            }
        }
    }

    showToast(`🎉 成功刪除 ${deletedCount} 個行程！`, 'success');
    await renderDashboard();
}

// 顯示非阻塞式 Toast 提示與進度 Notify
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return null;

    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-slate-900 text-emerald-400 border-emerald-500/30'
        : type === 'error' ? 'bg-rose-900 text-rose-200 border-rose-500/30'
        : 'bg-slate-900 text-indigo-300 border-indigo-500/30';
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400'
        : type === 'error' ? 'fa-circle-exclamation text-rose-400'
        : 'fa-circle-info text-indigo-400';

    toast.className = `${bgClass} border px-4 py-3 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-3 text-sm font-bold animate-fade-in transition-all z-50`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    return toast;
}

// 6. 選擇並批次上傳多個本地 YAML / JSON 檔案至 Google Drive
async function uploadLocalJsonFile(fileInput) {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const files = Array.from(fileInput.files);
    const total = files.length;
    let successCount = 0;

    const progressToast = showToast(`正在準備上傳 ${total} 個行程...`, 'info', 0);

    for (let i = 0; i < total; i++) {
        const file = files[i];
        const fileName = (file.name.endsWith('.yaml') || file.name.endsWith('.yml') || file.name.endsWith('.json')) 
            ? file.name 
            : `${file.name}.yaml`;

        if (progressToast) {
            progressToast.querySelector('span').innerText = `[${i + 1}/${total}] 上傳中：${fileName}...`;
        }

        try {
            const text = await file.text();
            const data = window.voyaYaml ? window.voyaYaml.parseYamlOrJson(text) : JSON.parse(text);
            await saveItineraryToDrive(fileName, data);
            successCount++;
        } catch (err) {
            console.error(`上傳 ${fileName} 失敗:`, err);
            showToast(`檔案 ${fileName} 解析或上傳失敗: ${err.message}`, 'error', 4000);
        }
    }

    if (progressToast) progressToast.remove();

    if (successCount > 0) {
        showToast(`🎉 成功完成 ${successCount}/${total} 個行程上傳！`, 'success', 3500);
        await renderDashboard();
    }

    fileInput.value = ''; // 清空 input 方便重複選擇
}

// 下載單個行程檔案至本地 (匯出 YAML)
async function downloadJsonFromDashboard(fileId, fileName) {
    const toast = showToast('正在下載行程 YAML 檔案...', 'info', 0);
    try {
        const token = voyaAuth.getAccessToken();
        if (!token) throw new Error('請先登入 Google 帳號！');

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`下載失敗: ${res.status}`);
        const rawText = await res.text();
        const data = window.voyaYaml ? window.voyaYaml.parseYamlOrJson(rawText) : JSON.parse(rawText);
        const yamlStr = window.voyaYaml ? window.voyaYaml.dumpYaml(data) : JSON.stringify(data, null, 2);

        // 觸發瀏覽器下載
        const blob = new Blob([yamlStr], { type: 'text/yaml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = fileName.replace(/\.(json|yaml|yml)$/i, '');
        a.download = `${cleanName}.yaml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.remove();
        showToast('🎉 行程 YAML 檔案下載成功！', 'success');
    } catch (err) {
        toast.remove();
        console.error(err);
        showToast(`下載失敗: ${err.message}`, 'error');
    }
}

// 匯出單個 PDF
async function exportPdfFromDashboard(fileId) {
    const toast = showToast('正在下載行程內容以準備列印...', 'info', 0);
    try {
        const token = voyaAuth.getAccessToken();
        if (!token) throw new Error('請先登入 Google 帳號！');

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`下載失敗: ${res.status}`);
        const data = await res.json();

        toast.remove();
        if (typeof window.exportItineraryToPdf === 'function') {
            await window.exportItineraryToPdf(data);
        } else {
            throw new Error('PDF 匯出模組尚未載入完成');
        }
    } catch (err) {
        toast.remove();
        console.error(err);
        showToast(`PDF 匯出失敗: ${err.message}`, 'error');
    }
}

// 批次下載所選 JSON
async function downloadSelectedJson() {
    const checkboxes = Array.from(document.querySelectorAll('.dashboard-checkbox:checked'));
    if (checkboxes.length === 0) return;

    const total = checkboxes.length;
    const progressToast = showToast(`正在準備批次下載 ${total} 個行程...`, 'info', 0);

    let successCount = 0;
    for (let i = 0; i < total; i++) {
        const cb = checkboxes[i];
        const fileId = cb.getAttribute('data-file-id');
        const card = cb.closest('.bg-white');
        const titleEl = card ? card.querySelector('h3') : null;
        const rawName = titleEl ? titleEl.innerText : 'itinerary';
        const fileName = `${rawName}.json`;

        if (progressToast) {
            progressToast.querySelector('span').innerText = `[${i + 1}/${total}] 下載中：${fileName}...`;
        }

        try {
            const token = voyaAuth.getAccessToken();
            if (!token) throw new Error('未登入');

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // 觸發下載
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            successCount++;
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error(`下載 ${fileName} 失敗:`, err);
            showToast(`下載 ${fileName} 失敗: ${err.message}`, 'error', 4000);
        }
    }

    progressToast.remove();
    if (successCount > 0) {
        showToast(`🎉 成功完成 ${successCount}/${total} 個行程 JSON 下載！`, 'success');
    }
}

// 批次匯出所選 PDF (每個行程彈出獨立 PDF 視窗)
async function exportSelectedPdf() {
    const checkboxes = Array.from(document.querySelectorAll('.dashboard-checkbox:checked'));
    if (checkboxes.length === 0) return;

    const total = checkboxes.length;
    const progressToast = showToast(`正在準備批次匯出 ${total} 個行程 PDF...`, 'info', 0);

    const itineraries = [];
    
    // 1. 批次下載所有檔案的內容
    for (let i = 0; i < total; i++) {
        const cb = checkboxes[i];
        const fileId = cb.getAttribute('data-file-id');
        const card = cb.closest('.bg-white');
        const titleEl = card ? card.querySelector('h3') : null;
        const rawName = titleEl ? titleEl.innerText : `itinerary-${i + 1}`;

        if (progressToast) {
            progressToast.querySelector('span').innerText = `[${i + 1}/${total}] 載入行程資料：${rawName}...`;
        }

        try {
            const token = voyaAuth.getAccessToken();
            if (!token) throw new Error('未登入');

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            itineraries.push(data);
        } catch (err) {
            console.error(`載入 ${rawName} 失敗:`, err);
            showToast(`載入 ${rawName} 失敗: ${err.message}`, 'error', 4000);
        }
    }

    progressToast.remove();

    if (itineraries.length === 0) {
        showToast('沒有成功載入任何行程，無法列印', 'error');
        return;
    }

    // 2. 呼叫核心列印 (每個行程獨立彈出)
    if (typeof window.exportItineraryToPdf === 'function') {
        await window.exportItineraryToPdf(itineraries);
    } else {
        showToast('PDF 匯出模組尚未載入完成', 'error');
    }
}

// 暴露全域 API
window.voyaDrive = {
    getOrCreateAppFolder,
    listItineraries,
    saveItineraryToDrive,
    deleteItineraryFromDrive,
    deleteSelectedItineraries,
    onCheckboxChange,
    toggleSelectAll,
    uploadLocalJsonFile,
    renderDashboard,
    showToast,
    downloadJsonFromDashboard,
    exportPdfFromDashboard,
    downloadSelectedJson,
    exportSelectedPdf
};
