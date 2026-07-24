// 行程資料與全域狀態
let itineraryData = null;
let currentLoadedUrl = null;
window.currentLoadedFileId = null;

// UndoStack (復原歷史紀錄佇列) - 限制最多 20 步以控管記憶體
const MAX_UNDO_STEPS = 20;
const undoStackInternal = [];

window.voyaUndoStack = {
    push(data) {
        if (!data) return;
        const snapshot = JSON.parse(JSON.stringify(data));
        undoStackInternal.push(snapshot);
        if (undoStackInternal.length > MAX_UNDO_STEPS) {
            undoStackInternal.shift();
        }
        this.updateButtonState();
    },
    undo() {
        if (undoStackInternal.length === 0) return;
        const previousState = undoStackInternal.pop();
        window.renderItineraryData(previousState);
        this.updateButtonState();
        if (window.voyaDrive) voyaDrive.showToast('↺ 已成功復原上一次修改！', 'info');

        // 背景同步至 Google Drive (若為個人檔案且已登入)
        if (typeof voyaAuth !== 'undefined' && voyaAuth.isLoggedIn() && window.currentLoadedFileId) {
            voyaDrive.saveItineraryToDrive(
                previousState.meta?.title || 'itinerary',
                previousState,
                window.currentLoadedFileId
            ).catch(err => console.warn('Undo 背景同步至 Drive 失敗:', err));
        }
    },
    updateButtonState() {
        const btn = document.getElementById('btn-undo-toolbar');
        if (btn) {
            btn.disabled = (undoStackInternal.length === 0);
        }
    },
    clear() {
        undoStackInternal.length = 0;
        this.updateButtonState();
    }
};

// 取得網址參數
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// 顏色轉換輔助函式 (HEX 轉 RGBA)
function hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(71, 85, 105, ${alpha})`;
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return `rgba(71, 85, 105, ${alpha})`;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 將 HEX 色碼加深 (調暗)
function darkenHex(hex, factor = 0.3) {
    if (!hex || typeof hex !== 'string') return '#1e293b';
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return '#1e293b';
    const r = Math.max(0, Math.min(255, Math.floor(parseInt(cleanHex.substring(0, 2), 16) * factor)));
    const g = Math.max(0, Math.min(255, Math.floor(parseInt(cleanHex.substring(2, 4), 16) * factor)));
    const b = Math.max(0, Math.min(255, Math.floor(parseInt(cleanHex.substring(4, 6), 16) * factor)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 將 HEX 色碼提亮
function lightenHex(hex) {
    if (!hex || typeof hex !== 'string') return '#7dd3fc';
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return '#7dd3fc';
    let r = parseInt(cleanHex.substring(0, 2), 16);
    let g = parseInt(cleanHex.substring(2, 4), 16);
    let b = parseInt(cleanHex.substring(4, 6), 16);
    r = Math.min(255, Math.floor(r + (255 - r) * 0.45));
    g = Math.min(255, Math.floor(g + (255 - g) * 0.45));
    b = Math.min(255, Math.floor(b + (255 - b) * 0.45));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 主題調色盤資料庫
const DESIGNER_PALETTES = {
    rose: {
        primary_dark: '#0f172a', primary_mid: '#881337', accent_primary: '#e11d48', accent_light: '#fb7185',
        accent_bg: '#fff1f2', accent_shadow: 'rgba(225, 29, 72, 0.4)', timeline_border: '#fda4af',
        btn_gradient_from: '#881337', btn_gradient_to: '#e11d48', btn_border: '#881337', btn_shadow: 'rgba(225, 29, 72, 0.25)',
        milestone_bg_from: '#fff1f2', milestone_bg_to: '#ffe4e6', milestone_border: '#fda4af', milestone_shadow: 'rgba(225, 29, 72, 0.08)',
        flight_text: '#e11d48', map_hover: '#be123c', subtitle_text: '#fda4af', date_text: '#e11d48',
        hero_gradient_from: '#0f172a', hero_gradient_via: '#4c0519', hero_gradient_to: '#1e1b4b'
    },
    sky: {
        primary_dark: '#0f172a', primary_mid: '#1e3a8a', accent_primary: '#0284c7', accent_light: '#38bdf8',
        accent_bg: '#f0f9ff', accent_shadow: 'rgba(2, 132, 199, 0.6)', timeline_border: '#bae6fd',
        btn_gradient_from: '#1e3a8a', btn_gradient_to: '#0284c7', btn_border: '#1e3a8a', btn_shadow: 'rgba(2, 132, 199, 0.3)',
        milestone_bg_from: '#f0f9ff', milestone_bg_to: '#e0f2fe', milestone_border: '#bae6fd', milestone_shadow: 'rgba(2, 132, 199, 0.1)',
        flight_text: '#0284c7', map_hover: '#0369a1', subtitle_text: '#7dd3fc', date_text: '#0284c7',
        hero_gradient_from: '#0f172a', hero_gradient_via: '#1e3a8a', hero_gradient_to: '#0c4a6e'
    },
    emerald: {
        primary_dark: '#0f172a', primary_mid: '#064e3b', accent_primary: '#10b981', accent_light: '#6ee7b7',
        accent_bg: '#f0fdf4', accent_shadow: 'rgba(16, 185, 129, 0.4)', timeline_border: '#a7f3d0',
        btn_gradient_from: '#064e3b', btn_gradient_to: '#10b981', btn_border: '#064e3b', btn_shadow: 'rgba(16, 185, 129, 0.25)',
        milestone_bg_from: '#f0fdf4', milestone_bg_to: '#dcfce7', milestone_border: '#a7f3d0', milestone_shadow: 'rgba(16, 185, 129, 0.08)',
        flight_text: '#059669', map_hover: '#047857', subtitle_text: '#6ee7b7', date_text: '#059669',
        hero_gradient_from: '#0f172a', hero_gradient_via: '#064e3b', hero_gradient_to: '#0f172a'
    },
    amber: {
        primary_dark: '#1e1b4b', primary_mid: '#451a03', accent_primary: '#f59e0b', accent_light: '#fcd34d',
        accent_bg: '#fffbeb', accent_shadow: 'rgba(245, 158, 11, 0.4)', timeline_border: '#fde68a',
        btn_gradient_from: '#451a03', btn_gradient_to: '#f59e0b', btn_border: '#451a03', btn_shadow: 'rgba(245, 158, 11, 0.25)',
        milestone_bg_from: '#fffbeb', milestone_bg_to: '#fef3c7', milestone_border: '#fde68a', milestone_shadow: 'rgba(245, 158, 11, 0.08)',
        flight_text: '#d97706', map_hover: '#b45309', subtitle_text: '#fde047', date_text: '#d97706',
        hero_gradient_from: '#1e1b4b', hero_gradient_via: '#451a03', hero_gradient_to: '#0f172a'
    },
    indigo: {
        primary_dark: '#0f172a', primary_mid: '#311042', accent_primary: '#6366f1', accent_light: '#a5b4fc',
        accent_bg: '#eef2ff', accent_shadow: 'rgba(99, 102, 241, 0.4)', timeline_border: '#c7d2fe',
        btn_gradient_from: '#311042', btn_gradient_to: '#6366f1', btn_border: '#311042', btn_shadow: 'rgba(99, 102, 241, 0.25)',
        milestone_bg_from: '#eef2ff', milestone_bg_to: '#e0e7ff', milestone_border: '#c7d2fe', milestone_shadow: 'rgba(99, 102, 241, 0.08)',
        flight_text: '#4f46e5', map_hover: '#4338ca', subtitle_text: '#a5b4fc', date_text: '#4f46e5',
        hero_gradient_from: '#0f172a', hero_gradient_via: '#311042', hero_gradient_to: '#1e1b4b'
    }
};

function applyTheme(theme) {
    const root = document.documentElement;
    if (typeof theme === 'string') {
        theme = { primary: theme };
    }
    theme = theme || {};

    const themeName = (theme.primary || '').toLowerCase();
    const basePalette = DESIGNER_PALETTES[themeName] || null;

    const accentPrimary = theme.accent_primary || (basePalette ? basePalette.accent_primary : '#0284c7');

    const computedHeroVia = (basePalette && basePalette.hero_gradient_via) ? basePalette.hero_gradient_via : darkenHex(accentPrimary, 0.35);
    const computedSubtitle = (basePalette && basePalette.subtitle_text) ? basePalette.subtitle_text : lightenHex(accentPrimary);
    const computedAccentLight = (basePalette && basePalette.accent_light) ? basePalette.accent_light : hexToRgba(accentPrimary, 0.35);
    const computedAccentBg = (basePalette && basePalette.accent_bg) ? basePalette.accent_bg : hexToRgba(accentPrimary, 0.08);
    const computedAccentShadow = (basePalette && basePalette.accent_shadow) ? basePalette.accent_shadow : hexToRgba(accentPrimary, 0.4);
    const computedTimelineBorder = (basePalette && basePalette.timeline_border) ? basePalette.timeline_border : hexToRgba(accentPrimary, 0.35);
    const computedDateText = (basePalette && basePalette.date_text) ? basePalette.date_text : accentPrimary;

    const computedTheme = {
        '--color-primary-dark': theme.primary_dark || (basePalette ? basePalette.primary_dark : '#0f172a'),
        '--color-primary-mid': theme.primary_mid || (basePalette ? basePalette.primary_mid : accentPrimary),
        '--color-accent-primary': accentPrimary,
        '--color-accent-light': theme.accent_light || computedAccentLight,
        '--color-accent-bg': theme.accent_bg || computedAccentBg,
        '--color-accent-shadow': theme.accent_shadow || computedAccentShadow,
        '--color-timeline-border': theme.timeline_border || computedTimelineBorder,
        '--color-btn-gradient-from': theme.btn_gradient_from || (basePalette ? basePalette.btn_gradient_from : accentPrimary),
        '--color-btn-gradient-to': theme.btn_gradient_to || (basePalette ? basePalette.btn_gradient_to : accentPrimary),
        '--color-btn-border': theme.btn_border || (basePalette ? basePalette.btn_border : accentPrimary),
        '--color-btn-shadow': theme.btn_shadow || (basePalette ? basePalette.btn_shadow : hexToRgba(accentPrimary, 0.25)),
        '--color-milestone-bg-from': theme.milestone_bg_from || (basePalette ? basePalette.milestone_bg_from : computedAccentBg),
        '--color-milestone-bg-to': theme.milestone_bg_to || (basePalette ? basePalette.milestone_bg_to : hexToRgba(accentPrimary, 0.15)),
        '--color-milestone-border': theme.milestone_border || (basePalette ? basePalette.milestone_border : computedTimelineBorder),
        '--color-milestone-shadow': theme.milestone_shadow || (basePalette ? basePalette.milestone_shadow : hexToRgba(accentPrimary, 0.08)),
        '--color-flight-text': theme.flight_text || (basePalette ? basePalette.flight_text : accentPrimary),
        '--color-map-hover': theme.map_hover || (basePalette ? basePalette.map_hover : accentPrimary),
        '--color-subtitle-text': theme.subtitle_text || computedSubtitle,
        '--color-date-text': theme.date_text || computedDateText,
        '--color-hero-gradient-from': theme.hero_gradient_from || (basePalette ? basePalette.hero_gradient_from : '#0f172a'),
        '--color-hero-gradient-via': theme.hero_gradient_via || computedHeroVia,
        '--color-hero-gradient-to': theme.hero_gradient_to || (basePalette ? basePalette.hero_gradient_to : '#1e1b4b'),
        '--color-logo-gradient-from': theme.btn_gradient_from || (basePalette ? basePalette.btn_gradient_from : '#4f46e5'),
        '--color-logo-gradient-to': accentPrimary || (basePalette ? basePalette.accent_primary : '#6366f1')
    };

    for (const [cssVar, val] of Object.entries(computedTheme)) {
        root.style.setProperty(cssVar, val);
    }

    const faviconColor = accentPrimary;
    const faviconEl = document.getElementById("favicon");
    if (faviconEl) {
        const svgContent = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='${encodeURIComponent(faviconColor)}'/><path d='M16 2 A14 14 0 0 0 2 16 A14 14 0 0 0 16 30 A14 14 0 0 0 30 16 A14 14 0 0 0 16 2 Z' fill='none' stroke='white' stroke-width='1.5' opacity='0.3'/><path d='M16 2 Q22 16 16 30 Q10 16 16 2' fill='none' stroke='white' stroke-width='1.5' opacity='0.4'/><path d='M2 16 H30' fill='none' stroke='white' stroke-width='1.5' opacity='0.4'/><path d='M12 18 L24 8 L20 22 L16 19 L12 18 Z M16 19 L24 8 L12 18 Z' fill='white'/></svg>`;
        faviconEl.href = `data:image/svg+xml,${svgContent}`;
    }
}

// 切換天數
function switchDay(dayNum) {
    localStorage.setItem('selectedDay', dayNum);

    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('text-slate-600', 'border-slate-100', 'hover:bg-slate-50');
    });

    const activeBtn = document.getElementById('btn-day' + dayNum);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-600', 'border-slate-100', 'hover:bg-slate-50');
        activeBtn.classList.add('active');
    }

    const dayContentArea = document.getElementById('day-content-area');
    if (!dayContentArea || !itineraryData) return;

    const days = itineraryData.days || [];
    const dayData = days.find(d => d.day_number === dayNum);
    if (!dayData) {
        dayContentArea.innerHTML = `<div class="p-8 bg-rose-50 text-rose-600 rounded-xl font-bold text-center">找不到 Day ${dayNum} 行程內容</div>`;
        return;
    }

    const timeline = dayData.timeline || dayData.items || dayData.activities || [];
    let timelineHtml = timeline.map((item, index) => {
        if (item.type === "split") {
            return renderSplitHtml(item);
        } else {
            return renderItemHtml(item, '', dayNum, index);
        }
    }).join("");

    if (window.voyaEditor && typeof window.voyaEditor.isEditMode === 'function' && window.voyaEditor.isEditMode()) {
        timelineHtml += `
            <div class="mt-8 pt-4 border-t border-dashed border-slate-200 text-center">
                <button onclick="voyaEditor.addItem(${dayNum})" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer">
                    <i class="fa-solid fa-plus text-xs"></i>
                    新增 Day ${dayNum} 行程景點
                </button>
            </div>
        `;
    }

    const dayHeaderHtml = `
        <div class="mb-6 border-b pb-4 border-slate-100 flex items-center justify-between">
            <div>
                <div class="text-amber-600 font-bold text-base tracking-widest font-mono uppercase mb-1.5">${dayData.date_label || `Day ${dayNum}`}</div>
                <h2 class="text-2xl font-black text-indigo-900 tracking-tight">${dayData.day_title || ''}</h2>
            </div>
        </div>
    `;

    dayContentArea.innerHTML = `<div class="animate-fade-in">${dayHeaderHtml} ${timelineHtml}</div>`;

    const toggleEl = document.getElementById('transfer-toggle');
    if (toggleEl && localStorage.getItem('showTransfers') !== null) {
        toggleEl.checked = localStorage.getItem('showTransfers') === 'true';
    }

    toggleTransfers();
}
window.switchDay = switchDay;

// 切換交通隱藏與顯示
function toggleTransfers() {
    const toggleElement = document.getElementById('transfer-toggle');
    if (!toggleElement) return;

    const isChecked = toggleElement.checked;
    localStorage.setItem('showTransfers', isChecked);

    document.querySelectorAll('.timeline-item-transfer').forEach(el => {
        el.classList.toggle('hidden', !isChecked);
    });
}
window.toggleTransfers = toggleTransfers;

/**
 * 檢查與控制 Viewer 工具列權限按鈕 (AI 修改 / Undo / 複製至雲端硬碟)
 */
function checkPermissionsAndToggleUI() {
    const isLogged = typeof voyaAuth !== 'undefined' && voyaAuth.isLoggedIn();
    const dataParam = getQueryParam('data') || '';

    const btnEdit = document.getElementById('btn-toggle-edit-mode');
    const btnAi = document.getElementById('btn-ai-copilot-toggle');
    const sideHandle = document.getElementById('ai-drawer-side-handle');
    const btnUndo = document.getElementById('btn-undo-toolbar');
    const btnCopy = document.getElementById('btn-copy-to-drive-toolbar');
    const btnCopyText = document.getElementById('btn-copy-text');

    // 判斷是否為預設範本或開啟外部分享連結
    const isTemplate = !dataParam || dataParam.includes('templates/itinerary');

    if (window.currentLoadedFileId && isLogged) {
        // 使用者有登入且載入了自己的 Drive 檔案 -> 顯示 編輯、AI 與 Undo，隱藏複製
        if (btnEdit) btnEdit.classList.remove('hidden');
        if (btnAi) btnAi.classList.remove('hidden');
        if (sideHandle) sideHandle.classList.remove('hidden');
        if (btnUndo) btnUndo.classList.remove('hidden');
        if (btnCopy) btnCopy.classList.add('hidden');
    } else {
        // 外部公開連結、預設範本或未登入 -> 隱藏 編輯、AI 與 Undo，顯示副本複製引導
        if (btnEdit) btnEdit.classList.add('hidden');
        if (btnAi) btnAi.classList.add('hidden');
        if (sideHandle) sideHandle.classList.add('hidden');
        if (btnUndo) btnUndo.classList.add('hidden');

        if (btnCopy) {
            btnCopy.classList.remove('hidden');
            if (isLogged) {
                if (btnCopyText) btnCopyText.innerText = '複製到我的雲端硬碟';
            } else {
                if (btnCopyText) btnCopyText.innerText = '登入以複製到我的雲端硬碟';
            }
        }
    }
}

/**
 * 將當前檢視的行程複製一份至使用者的 Google Drive
 */
async function copyCurrentItineraryToMyDrive() {
    const isLogged = typeof voyaAuth !== 'undefined' && voyaAuth.isLoggedIn();

    if (!isLogged) {
        voyaDrive.showToast('請先登入 Google 帳號授權儲存至您的 Google Drive！', 'info');
        voyaAuth.login();
        return;
    }

    if (!itineraryData) return;

    try {
        const title = itineraryData.meta?.title || '旅遊行程';
        voyaDrive.showToast(`正在複製「${title}」至您的雲端硬碟...`, 'info', 0);

        const result = await voyaDrive.saveItineraryToDrive(`[副本] ${title}`, itineraryData);
        voyaDrive.showToast('🎉 已成功複製至您的 Google Drive！', 'success');

        // 自動跳轉至新建立的副本檔案
        window.location.hash = `#viewer?data=${encodeURIComponent(result.directUrl)}`;
        init(true);
    } catch (err) {
        console.error('複製行程失敗:', err);
        voyaDrive.showToast(`複製失敗: ${err.message}`, 'error');
    }
}

/**
 * 下載當前行程為 YAML 格式檔案
 */
function downloadCurrentYaml() {
    if (!itineraryData) return;

    const yamlStr = window.voyaYaml ? window.voyaYaml.dumpYaml(itineraryData) : JSON.stringify(itineraryData, null, 2);
    const blob = new Blob([yamlStr], { type: 'text/yaml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = itineraryData.meta?.title || 'itinerary';
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `${safeTitle}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    voyaDrive.showToast('🎉 YAML 行程檔案下載成功！', 'success');
}

// 從 URL 載入資料並初始化網頁 (支援 JSON 與 YAML 自動相容)
async function init(forceReload = false) {
    const rawDataUrl = getQueryParam('data') || 'templates/itinerary.yaml';
    const dataUrl = (typeof normalizeDataUrl === 'function') ? normalizeDataUrl(rawDataUrl) : rawDataUrl;
    const dayContentArea = document.getElementById('day-content-area');

    if (!forceReload && currentLoadedUrl === dataUrl && itineraryData) {
        checkPermissionsAndToggleUI();
        return;
    }

    try {
        let headers = {};
        let finalUrl = dataUrl;

        const gDriveIdMatch = dataUrl.match(/lh3\.googleusercontent\.com\/d\/([^/?#]+)/) ||
            dataUrl.match(/(?:drive|docs)\.google\.com\/uc\?export=download&id=([^&]+)/) ||
            dataUrl.match(/(?:drive|docs)\.google\.com\/file\/d\/([^/?#]+)/);

        const fileId = gDriveIdMatch ? gDriveIdMatch[1] : null;
        window.currentLoadedFileId = fileId;

        const token = (typeof voyaAuth !== 'undefined') ? voyaAuth.getAccessToken() : null;
        const gasProxyUrl = (typeof VOYA_CONFIG !== 'undefined' ? VOYA_CONFIG.GAS_PROXY_URL : '') || localStorage.getItem('voyagen_gas_proxy_url') || '';

        if (fileId) {
            if (token) {
                finalUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                headers['Authorization'] = `Bearer ${token}`;
            } else if (gasProxyUrl) {
                finalUrl = `${gasProxyUrl}?id=${fileId}`;
            } else {
                throw new Error('未設定 GAS 中繼代理服務，無法在未登入狀態下讀取 Google Drive 公開行程。');
            }
        }

        const response = await fetch(finalUrl, { headers });
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

        const rawText = await response.text();

        // 使用 voyaYaml 解析 (無縫相容 JSON 與 YAML)
        if (window.voyaYaml && typeof window.voyaYaml.parseYamlOrJson === 'function') {
            itineraryData = window.voyaYaml.parseYamlOrJson(rawText);
        } else {
            itineraryData = JSON.parse(rawText);
        }

        if (itineraryData && itineraryData.error) {
            throw new Error(`GAS 中繼代理錯誤: ${itineraryData.error}`);
        }

        currentLoadedUrl = dataUrl;

        // 相容性拆包
        if (itineraryData && !itineraryData.days && itineraryData.itinerary?.days) {
            itineraryData = itineraryData.itinerary;
        } else if (itineraryData && !itineraryData.days && itineraryData.data?.days) {
            itineraryData = itineraryData.data;
        }
        itineraryData.meta = itineraryData.meta || {};
        itineraryData.days = itineraryData.days || [];

        // 1. 初始化 Meta 與主題
        document.title = itineraryData.meta.title || "VoyaGen 旅遊行程";
        const titleEl = document.getElementById('trip-title');
        if (titleEl) {
            const titleText = itineraryData.meta.title || "";
            const titleParts = titleText.split(' ');
            if (titleParts.length >= 2) {
                const mainTitle = titleParts.slice(0, -1).join(' ');
                const highlightTitle = titleParts[titleParts.length - 1];
                titleEl.innerHTML = `
                    ${mainTitle} <br class="md:hidden">
                    <span class="text-transparent bg-clip-text" style="background-image: linear-gradient(to right, var(--color-accent-light), var(--color-accent-primary)) !important;">${highlightTitle}</span>
                `;
            } else {
                titleEl.innerText = titleText;
            }
        }
        document.getElementById('trip-subtitle').innerText = `✦ ${itineraryData.meta.subtitle || '旅遊行程'} ✦`;
        document.getElementById('trip-date').innerText = itineraryData.meta.date_range || '';

        const routeEl = document.getElementById('trip-route');
        const dividerEl = document.getElementById('trip-divider');
        if (routeEl) {
            routeEl.innerText = itineraryData.meta.route || "";
            if (itineraryData.meta.route) {
                routeEl.classList.remove('hidden');
                if (dividerEl) dividerEl.classList.remove('hidden');
            } else {
                routeEl.classList.add('hidden');
                if (dividerEl) dividerEl.classList.add('hidden');
            }
        }

        document.getElementById('trip-update').innerText = `最後更新：${itineraryData.meta.last_updated || '無'}`;

        applyTheme(itineraryData.meta.theme || {});

        // 2. 初始化側邊欄
        const sidebar = document.getElementById('day-sidebar');
        if (sidebar) {
            const daysList = itineraryData.days || [];
            sidebar.innerHTML = daysList.map(day => `
                <button onclick="switchDay(${day.day_number})" id="btn-day${day.day_number}" class="day-btn flex-shrink-0 text-left px-4 py-3 rounded-xl border border-slate-100 font-medium text-slate-600 hover:bg-slate-50 transition-all">
                    Day ${day.day_number}
                    <span class="block text-xs font-normal opacity-80 mt-0.5">${day.day_title || ''}</span>
                </button>
            `).join("");
        }

        // 3. 綁定開關事件與工具欄
        const toggleEl = document.getElementById('transfer-toggle');
        if (toggleEl) {
            toggleEl.addEventListener('change', toggleTransfers);
        }

        const btnPdfToolbar = document.getElementById('btn-export-pdf-toolbar');
        if (btnPdfToolbar) {
            btnPdfToolbar.onclick = () => {
                if (itineraryData) window.exportItineraryToPdf(itineraryData);
            };
        }

        // 檢查權限顯示按鈕
        checkPermissionsAndToggleUI();

        // 4. 載入預設 Day
        const savedDay = parseInt(localStorage.getItem('selectedDay')) || 1;
        const startDay = itineraryData.days.some(d => d.day_number === savedDay) ? savedDay : itineraryData.days[0].day_number;
        switchDay(startDay);

    } catch (error) {
        console.error("載入行程失敗:", error);
        if (dayContentArea) {
            dayContentArea.innerHTML = `
                <div class="p-8 bg-rose-50 text-rose-600 rounded-xl font-bold text-center shadow-sm">
                    <i class="fa-solid fa-circle-exclamation text-3xl mb-3 block"></i>
                    載入行程資料失敗！<br>
                    <span class="text-sm font-normal text-rose-400 mt-2 block">錯誤原因: ${error.message}</span>
                    <span class="text-xs font-normal text-slate-400 mt-1 block">請檢查網址參數 ?data= 是否正確。</span>
                </div>
            `;
        }
    }
}

// 頁面載入由 Router 來控制是否執行 initItineraryView，不再預設載入範本
window.initItineraryView = init;
window.getItineraryData = () => itineraryData;
window.renderItineraryData = (data) => {
    if (!data) return;
    itineraryData = data;
    itineraryData.meta = itineraryData.meta || {};
    itineraryData.days = itineraryData.days || [];

    document.title = itineraryData.meta.title || "VoyaGen 旅遊行程";
    const titleEl = document.getElementById('trip-title');
    if (titleEl) {
        titleEl.innerText = itineraryData.meta.title || "";
    }
    const subtitleEl = document.getElementById('trip-subtitle');
    if (subtitleEl) {
        subtitleEl.innerText = itineraryData.meta.subtitle || "✦ 旅遊行程 ✦";
    }
    const dateEl = document.getElementById('trip-date');
    if (dateEl) {
        dateEl.innerText = itineraryData.meta.date_range || "";
    }
    const routeEl = document.getElementById('trip-route');
    const dividerEl = document.getElementById('trip-divider');
    if (routeEl) {
        routeEl.innerText = itineraryData.meta.route || "";
        if (itineraryData.meta.route) {
            routeEl.classList.remove('hidden');
            if (dividerEl) dividerEl.classList.remove('hidden');
        }
    }
    const updateEl = document.getElementById('trip-update');
    if (updateEl) {
        updateEl.innerText = `最後更新：${itineraryData.meta.last_updated || '無'}`;
    }

    applyTheme(itineraryData.meta.theme || {});

    const sidebar = document.getElementById('day-sidebar');
    if (sidebar) {
        const daysList = itineraryData.days || [];
        const isEdit = (window.voyaEditor && typeof window.voyaEditor.isEditMode === 'function' && window.voyaEditor.isEditMode());

        let sidebarHtml = daysList.map(day => {
            const dayControls = isEdit ? `
                <div class="flex items-center gap-1 ml-2 shrink-0">
                    <span onclick="voyaEditor.moveDay(${day.day_number}, -1, event)" class="px-1.5 py-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/80 rounded transition-colors text-[10px]" title="前移天數">
                        <i class="fa-solid fa-chevron-left md:hidden"></i>
                        <i class="fa-solid fa-chevron-up hidden md:inline"></i>
                    </span>
                    <span onclick="voyaEditor.moveDay(${day.day_number}, 1, event)" class="px-1.5 py-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/80 rounded transition-colors text-[10px]" title="後移天數">
                        <i class="fa-solid fa-chevron-right md:hidden"></i>
                        <i class="fa-solid fa-chevron-down hidden md:inline"></i>
                    </span>
                    <span onclick="voyaEditor.deleteDay(${day.day_number}, event)" class="px-1.5 py-0.5 text-rose-400 hover:text-rose-600 hover:bg-rose-100/80 rounded transition-colors text-[10px]" title="刪除整天"><i class="fa-solid fa-trash-can"></i></span>
                </div>
            ` : '';

            const dragAttrs = isEdit ? `draggable="true" ondragstart="voyaEditor.handleDayTabDragStart(event, ${day.day_number})" ondragend="voyaEditor.handleDayTabDragEnd(event)"` : '';

            return `
                <button onclick="switchDay(${day.day_number})" id="btn-day${day.day_number}" ${dragAttrs} ondragover="event.preventDefault(); this.classList.add('bg-amber-100', 'border-amber-400');" ondragleave="this.classList.remove('bg-amber-100', 'border-amber-400');" ondrop="this.classList.remove('bg-amber-100', 'border-amber-400'); voyaEditor.handleDayTabDrop(event, ${day.day_number}); voyaEditor.handleDropOnDay(event, ${day.day_number});" class="day-btn flex-shrink-0 text-left px-4 py-3 rounded-xl border border-slate-100 font-medium text-slate-600 hover:bg-slate-50 transition-all cursor-pointer">
                    <div class="flex items-center justify-between">
                        <div>
                            Day ${day.day_number}
                            <span class="block text-xs font-normal opacity-80 mt-0.5">${day.day_title || ''}</span>
                        </div>
                        ${dayControls}
                    </div>
                </button>
            `;
        }).join("");

        if (isEdit) {
            sidebarHtml += `
                <button onclick="voyaEditor.addDay()" class="day-btn flex-shrink-0 text-center px-4 py-3 rounded-xl border border-dashed border-slate-300 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 font-bold transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm">
                    <i class="fa-solid fa-plus text-xs"></i>
                    新增天數
                </button>
            `;
        }

        sidebar.innerHTML = sidebarHtml;
    }

    checkPermissionsAndToggleUI();

    const startDay = itineraryData.days.length > 0 ? itineraryData.days[0].day_number : 1;
    switchDay(startDay);
};

// 查詢並於 Console 列出所有目前專案可調用的 Gemini 模型
async function logAvailableModels() {
    const isLogged = typeof voyaAuth !== 'undefined' && voyaAuth.isLoggedIn();
    if (!isLogged) return;
    const token = voyaAuth.getAccessToken();
    if (!token) return;

    try {
        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
        const requestHeaders = {
            'Authorization': `Bearer ${token}`
        };
        const clientId = (typeof VOYA_CONFIG !== 'undefined') ? VOYA_CONFIG.DEFAULT_CLIENT_ID : '';
        const projectIdMatch = clientId.match(/^(\d+)-/);
        if (projectIdMatch) {
            requestHeaders['x-goog-user-project'] = projectIdMatch[1];
        }

        const res = await fetch(apiUrl, { headers: requestHeaders });
        if (res.ok) {
            const data = await res.json();
            console.log('🤖 [VoyaGen] 偵測到可調用的 Gemini 模型列表:', data.models || data);
        } else {
            console.warn(`🤖 [VoyaGen] 無法獲取 Gemini 模型列表 (${res.status}):`, await res.text());
        }
    } catch (err) {
        console.error('🤖 [VoyaGen] 獲取 Gemini 模型列表出錯:', err);
    }
}

// 切換 AI 助理對話側邊欄 (Drawer)
function toggleAiDrawer(show = null) {
    const drawer = document.getElementById('ai-drawer');
    const handleIcon = document.getElementById('ai-drawer-handle-icon');
    const sideHandle = document.getElementById('ai-drawer-side-handle');
    if (!drawer) return;

    const isHidden = drawer.classList.contains('translate-x-full');
    const shouldShow = (show !== null) ? show : isHidden;

    if (shouldShow) {
        drawer.classList.remove('translate-x-full');
        if (handleIcon) handleIcon.className = 'fa-solid fa-chevron-right text-slate-500 text-xs';
        if (sideHandle) sideHandle.setAttribute('data-tooltip-left', '收折對話框');

        // 異步列出可用模型至 console log
        logAvailableModels();
    } else {
        drawer.classList.add('translate-x-full');
        if (handleIcon) handleIcon.className = 'fa-solid fa-wand-magic-sparkles text-sky-600 text-sm';
        if (sideHandle) sideHandle.setAttribute('data-tooltip-left', 'AI 旅遊對話助理');
    }
}
window.toggleAiDrawer = toggleAiDrawer;

// 處理 AI 對話發送
function handleAiChatSubmit() {
    const input = document.getElementById('ai-chat-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    if (window.voyaGenerator && typeof window.voyaGenerator.chatModifyWithAI === 'function') {
        window.voyaGenerator.chatModifyWithAI(text);
    }
}
window.handleAiChatSubmit = handleAiChatSubmit;

// 暴露權限與複製全域工具
window.voyaRender = {
    checkPermissionsAndToggleUI,
    copyCurrentItineraryToMyDrive,
    downloadCurrentYaml,
    toggleAiDrawer,
    handleAiChatSubmit
};

// 核心匯出 PDF 列印邏輯 (支援單個與批次)
window.exportItineraryToPdf = async function(itineraryOrList) {
    const itineraries = Array.isArray(itineraryOrList) ? itineraryOrList : [itineraryOrList];
    const printArea = document.getElementById('print-all-days-area');
    if (!printArea) return;

    const originalTheme = (typeof itineraryData !== 'undefined' && itineraryData?.meta?.theme) ? itineraryData.meta.theme : null;
    const originalTitle = document.title;

    const showTransfers = localStorage.getItem('showTransfers') !== 'false';
    if (!showTransfers) {
        document.body.classList.add('hide-transfers-print');
    } else {
        document.body.classList.remove('hide-transfers-print');
    }

    for (let i = 0; i < itineraries.length; i++) {
        const itinerary = itineraries[i];
        const meta = itinerary.meta || {};
        const days = itinerary.days || [];

        if (typeof applyTheme === 'function') {
            applyTheme(meta.theme || {});
        }
        document.title = meta.title || "VoyaGen 旅遊行程";

        let htmlContent = `
            <div class="print-itinerary-section">
                <div class="print-cover">
                    <h1>${meta.title || "VoyaGen 旅遊行程"}</h1>
                    <p>${meta.subtitle || "✦ 旅遊行程 ✦"}</p>
                    <div class="flex items-center justify-center gap-4 text-sm mt-4 flex-wrap">
                        <span><i class="fa-regular fa-calendar mr-1.5"></i>${meta.date_range || ""}</span>
                        ${meta.route ? `<span class="opacity-50">|</span><span><i class="fa-solid fa-route mr-1.5"></i>${meta.route}</span>` : ""}
                    </div>
                </div>
        `;

        for (const day of days) {
            const timeline = day.timeline || day.items || day.activities || [];
            const timelineHtml = timeline.map(item => {
                if (item.type === "split") {
                    return renderSplitHtml(item);
                } else {
                    return renderItemHtml(item);
                }
            }).join("");

            htmlContent += `
                <div class="print-day-section">
                    <div class="mb-6 border-b pb-4 border-slate-100">
                        <div class="text-amber-600 font-bold text-sm tracking-widest font-mono uppercase mb-1">${day.date_label || `Day ${day.day_number}`}</div>
                        <h2 class="text-2xl font-black text-indigo-900 tracking-tight">${day.day_title}</h2>
                    </div>
                    <div class="print-timeline-container relative pl-4 border-l-2">
                        ${timelineHtml}
                    </div>
                </div>
            `;
        }

        htmlContent += `</div>`;
        printArea.innerHTML = htmlContent;

        window.print();
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (originalTheme && typeof applyTheme === 'function') {
        applyTheme(originalTheme);
    }
    document.title = originalTitle;
    document.body.classList.remove('hide-transfers-print');
    printArea.innerHTML = '';
};
