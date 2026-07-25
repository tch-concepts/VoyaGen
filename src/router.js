/**
 * VoyaGen SPA 輕量前端路由器 (Router)
 * 管理 About, Dashboard, Generator, Viewer 視圖切換
 */

const routes = {
    'about': 'view-about',
    'dashboard': 'view-dashboard',
    'generator': 'view-generator',
    'viewer': 'view-viewer'
};

function navigateTo(routeName) {
    const targetRoute = routes[routeName] ? routeName : 'about';
    
    // 更新 URL Hash (若非預設或有 data 參數時適度處理)
    if (window.location.hash !== `#${targetRoute}`) {
        window.location.hash = targetRoute;
    }

    // 切換視圖容器顯示
    Object.keys(routes).forEach(r => {
        const elementId = routes[r];
        const viewEl = document.getElementById(elementId);
        if (viewEl) {
            if (r === targetRoute) {
                viewEl.classList.remove('hidden');
            } else {
                viewEl.classList.add('hidden');
            }
        }
    });

    // 更新網頁標題
    if (targetRoute === 'dashboard') {
        document.title = "VoyaGen - 我的行程庫";
    } else if (targetRoute === 'generator') {
        document.title = "VoyaGen - AI 旅遊規劃師";
    } else if (targetRoute === 'about') {
        document.title = "VoyaGen";
    }

    // 若非行程檢視頁，關閉 AI 對話助理側邊欄並重置主題
    if (targetRoute !== 'viewer') {
        if (typeof window.toggleAiDrawer === 'function') {
            window.toggleAiDrawer(false);
        }
        if (typeof window.applyTheme === 'function') {
            window.applyTheme({
                accent_primary: '#0284c7',
                accent_gradient_from: '#0284c7',
                accent_gradient_to: '#06b6d4',
                banner_image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80',
                banner_position: 'center',
                banner_overlay: 'rgba(15, 23, 42, 0.45)',
                theme_card_border: 'rgba(241, 245, 249, 0.9)'
            });
        }
    }

    // 若切換至 dashboard，觸發 Dashboard 讀取
    if (targetRoute === 'dashboard' && typeof window.voyaDrive !== 'undefined' && typeof window.voyaDrive.renderDashboard === 'function') {
        window.voyaDrive.renderDashboard();
    }

    // 若切換至 generator，初始化 AI 生成器
    if (targetRoute === 'generator' && typeof window.voyaGenerator !== 'undefined' && typeof window.voyaGenerator.initGeneratorView === 'function') {
        window.voyaGenerator.initGeneratorView();
    }

    // 若切換至 viewer，觸發 行程載入
    if (targetRoute === 'viewer' && typeof window.initItineraryView === 'function') {
        window.initItineraryView();
    }

    // 更新導覽列 Active 狀態
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-route') === targetRoute) {
            link.classList.add('text-indigo-600', 'bg-indigo-50/80', 'font-bold');
            link.classList.remove('text-slate-600', 'hover:bg-slate-100/80');
        } else {
            link.classList.remove('text-indigo-600', 'bg-indigo-50/80', 'font-bold');
            link.classList.add('text-slate-600', 'hover:bg-slate-100/80');
        }
    });
}

function handleHashChange() {
    const rawHash = window.location.hash.replace('#', '').trim();
    const cleanRoute = rawHash.split('?')[0];
    const urlParams = new URLSearchParams(window.location.search);

    if (cleanRoute && routes[cleanRoute]) {
        navigateTo(cleanRoute);
    } else if (urlParams.has('data')) {
        navigateTo('viewer');
    } else {
        navigateTo('about');
    }
}

// 初始化路由器
function initRouter() {
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
}

document.addEventListener('DOMContentLoaded', initRouter);
window.navigateTo = navigateTo;
