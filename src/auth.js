/**
 * VoyaGen Google Identity Services (GSI) 登入與 Token 管理模組
 * 處理 Google OAuth 2.0 授權 (Drive.file & Generative-Language Scopes)
 */

// 預設 Client ID (優先讀取 localStorage，次之讀取 VOYA_CONFIG)
let GOOGLE_CLIENT_ID = localStorage.getItem('voyagen_google_client_id') || (typeof VOYA_CONFIG !== 'undefined' ? VOYA_CONFIG.DEFAULT_CLIENT_ID : '');

const SCOPES = [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/generative-language.retriever'
].join(' ');

let tokenClient = null;
let currentTokenResponse = null;



// 設定並儲存 Client ID
function setClientId(newClientId) {
    GOOGLE_CLIENT_ID = newClientId.trim();
    localStorage.setItem('voyagen_google_client_id', GOOGLE_CLIENT_ID);
    initTokenClient();
}

// 初始化 Token Client
function initTokenClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.warn('Google GSI SDK 尚未載入完成');
        return;
    }
    if (!GOOGLE_CLIENT_ID) {
        console.info('未設定 Google Client ID，請至設定或登入頁填寫');
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) {
                    console.error('Google OAuth 授權失敗:', response);
                    alert(`授權失敗: ${response.error_description || response.error}`);
                    return;
                }
                
                currentTokenResponse = response;
                // 計算過期時間 (保留 60 秒 buffer)
                const expiresInMs = (parseInt(response.expires_in) - 60) * 1000;
                const expiryTime = Date.now() + expiresInMs;

                localStorage.setItem('voyagen_access_token', response.access_token);
                localStorage.setItem('voyagen_token_expiry', expiryTime.toString());

                console.log('✅ 成功取得 Google AccessToken');
                fetchUserProfile(response.access_token);
                updateAuthUI();

                // 登入後自動切換至 Dashboard
                if (typeof navigateTo === 'function') {
                    navigateTo('dashboard');
                }
            },
        });
    } catch (e) {
        console.error('初始化 Google Token Client 出錯:', e);
    }
}

// 撈取 Google 使用者個人資料 (User Profile)
async function fetchUserProfile(token) {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const profile = await res.json();
            localStorage.setItem('voyagen_user_profile', JSON.stringify(profile));
            updateAuthUI();
        }
    } catch (e) {
        console.warn('無法抓取 User Profile:', e);
    }
}

function getUserProfile() {
    const raw = localStorage.getItem('voyagen_user_profile');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

// 點擊右上角使用者按鈕
function handleUserButtonClick() {
    if (isLoggedIn()) {
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
    } else {
        login();
    }
}

// 觸發登入
function login() {
    if (!GOOGLE_CLIENT_ID) {
        const inputId = prompt('請輸入您的 Google Cloud OAuth Client ID：\n(可在 Google Cloud Console 的 Credentials 頁面取得)');
        if (inputId && inputId.trim()) {
            setClientId(inputId);
        } else {
            return;
        }
    }

    if (!tokenClient) {
        initTokenClient();
    }

    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        alert('請先填寫有效的 Google OAuth Client ID');
    }
}

// 登出
function logout() {
    const token = getAccessToken();
    if (token && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(token, () => {
            console.log('已撤銷 AccessToken');
        });
    }
    localStorage.removeItem('voyagen_access_token');
    localStorage.removeItem('voyagen_token_expiry');
    localStorage.removeItem('voyagen_user_profile');
    currentTokenResponse = null;

    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    updateAuthUI();
    if (typeof navigateTo === 'function') {
        navigateTo('about');
    }
}

// 取得目前的 AccessToken (自動檢查過期)
function getAccessToken() {
    const token = localStorage.getItem('voyagen_access_token');
    const expiry = localStorage.getItem('voyagen_token_expiry');

    if (!token || !expiry) return null;
    if (Date.now() > parseInt(expiry)) {
        console.warn('AccessToken 已過期，請重新登入');
        localStorage.removeItem('voyagen_access_token');
        localStorage.removeItem('voyagen_token_expiry');
        localStorage.removeItem('voyagen_user_profile');
        return null;
    }
    return token;
}

// 檢查是否已登入
function isLoggedIn() {
    return !!getAccessToken();
}

// 處理頂欄使用者圓形圖示點擊事件
function handleUserButtonClick() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// 更新頁面上的登入狀態與 UI
function updateAuthUI() {
    const loggedIn = isLoggedIn();
    const profile = getUserProfile();
    const navUserIcon = document.getElementById('nav-user-icon');
    const dropdownName = document.getElementById('user-dropdown-name');
    const dropdownEmail = document.getElementById('user-dropdown-email');
    const dropdownLoginBtn = document.getElementById('dropdown-login-btn');
    const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');
    const clientIdInput = document.getElementById('client-id-input');

    if (clientIdInput) clientIdInput.value = GOOGLE_CLIENT_ID;


    if (navUserIcon) {
        if (loggedIn && profile?.picture) {
            navUserIcon.innerHTML = `<img src="${profile.picture}" class="w-6 h-6 rounded-full object-cover shadow-sm">`;
        } else if (loggedIn) {
            navUserIcon.innerHTML = `<i class="fa-solid fa-user-check text-emerald-600"></i>`;
        } else {
            // 官方標準彩色 Google G Logo SVG
            navUserIcon.innerHTML = `<svg class="w-4 h-4 inline-block" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>`;
        }
    }

    if (dropdownName) dropdownName.innerText = loggedIn ? (profile?.name || 'Google 使用者') : '未登入帳號';
    if (dropdownEmail) dropdownEmail.innerText = loggedIn ? (profile?.email || '已連結 Google 帳號') : '點擊下方登入授權 Google Drive';

    if (dropdownLoginBtn && dropdownLogoutBtn) {
        if (loggedIn) {
            dropdownLoginBtn.classList.add('hidden');
            dropdownLogoutBtn.classList.remove('hidden');
            dropdownLogoutBtn.classList.add('flex');
        } else {
            dropdownLoginBtn.classList.remove('hidden');
            dropdownLoginBtn.classList.add('flex');
            dropdownLogoutBtn.classList.add('hidden');
        }
    }

    // 登入頁按鈕與面板切換
    const loginCardNotAuth = document.getElementById('login-card-not-auth');
    const loginCardAuth = document.getElementById('login-card-auth');

    if (loginCardNotAuth && loginCardAuth) {
        if (loggedIn) {
            loginCardNotAuth.classList.add('hidden');
            loginCardAuth.classList.remove('hidden');
        } else {
            loginCardNotAuth.classList.remove('hidden');
            loginCardAuth.classList.add('hidden');
        }
    }

    // 若目前在 Dashboard 畫面，同步刷新 Dashboard 列表
    const dashboardView = document.getElementById('view-dashboard');
    if (dashboardView && !dashboardView.classList.contains('hidden')) {
        if (typeof window.voyaDrive !== 'undefined' && typeof window.voyaDrive.renderDashboard === 'function') {
            window.voyaDrive.renderDashboard();
        }
    }
}

// 點擊選單外部自動關閉下拉選單
document.addEventListener('click', (e) => {
    const btn = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// DOM 加載後初始化
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    // 延遲等 GSI SDK 加載
    setTimeout(() => {
        initTokenClient();
    }, 500);
});

// 暴露全域 API
window.voyaAuth = {
    setClientId,
    login,
    logout,
    getAccessToken,
    isLoggedIn,
    getUserProfile,
    handleUserButtonClick,
    updateAuthUI
};
