// 豆瓣功能核心逻辑

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
        doubanToggle.checked = isEnabled;
        
        // 设置开关外观
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg.nextElementSibling;
        if (isEnabled) {
            toggleBg.classList.add('bg-pink-600');
            toggleDot.classList.add('translate-x-6');
        }
        
        // 添加事件监听
        doubanToggle.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);
            
            // 更新开关外观
            if (isChecked) {
                toggleBg.classList.add('bg-pink-600');
                toggleDot.classList.add('translate-x-6');
            } else {
                toggleBg.classList.remove('bg-pink-600');
                toggleDot.classList.remove('translate-x-6');
            }
            
            // 更新显示状态
            updateDoubanVisibility();
        });
        
        // 初始更新显示状态
        updateDoubanVisibility();

        // 滚动到页面顶部
        window.scrollTo(0, 0);
    }
    
    // 初始加载各分类内容
    if (localStorage.getItem('doubanEnabled') === 'true') {
        window.doubanCardsUI.loadAllCategoryContent();
    }
    
    // 设置"更多"按钮点击事件
    window.doubanCardsUI.setupMoreButtons();
}

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) return;
    
    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    const isSearching = document.getElementById('resultsArea') && 
        !document.getElementById('resultsArea').classList.contains('hidden');
    
    // 只有在启用且没有搜索结果显示时才显示豆瓣区域
    if (isEnabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        // 如果豆瓣结果为空，重新加载
        window.doubanCardsUI.loadAllCategoryContent();
    } else {
        doubanArea.classList.add('hidden');
    }
}

// 填充搜索框并执行搜索
function fillAndSearch(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        search(); // 使用已有的search函数执行搜索
        
        // 同时更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - YTPPTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
    }
}

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
async function fillAndSearchWithDouban(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // 确保豆瓣资源API被选中
    if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
        // 在设置中勾选豆瓣资源API复选框
        const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
        if (doubanCheckbox) {
            doubanCheckbox.checked = true;
            
            // 触发updateSelectedAPIs函数以更新状态
            if (typeof updateSelectedAPIs === 'function') {
                updateSelectedAPIs();
            } else {
                // 如果函数不可用，则手动添加到selectedAPIs
                selectedAPIs.push('dbzy');
                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
                
                // 更新选中API计数（如果有这个元素）
                const countEl = document.getElementById('selectedAPICount');
                if (countEl) {
                    countEl.textContent = selectedAPIs.length;
                }
            }
            
            showToast('已自动选择豆瓣资源API', 'info');
        }
    }
    
    // 填充搜索框并执行搜索
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        await search(); // 使用已有的search函数执行搜索
        
        // 更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - YTPPTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }

        if (window.innerWidth <= 768) {
          window.scrollTo({
              top: 0,
              behavior: 'smooth'
          });
        }
    }
}

// 重置到首页
function resetToHome() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    const resultsArea = document.getElementById('resultsArea');
    if (resultsArea) resultsArea.classList.add('hidden');
    
    updateDoubanVisibility();
    
    // 更新URL，移除搜索参数
    try {
        window.history.pushState({}, 'YTPPTV', '/');
        document.title = 'YTPPTV';
    } catch (e) {
        console.error('更新浏览器历史失败:', e);
    }
}

// 导出函数
window.doubanCore = {
    initDouban: initDouban,
    updateDoubanVisibility: updateDoubanVisibility,
    fillAndSearch: fillAndSearch,
    fillAndSearchWithDouban: fillAndSearchWithDouban,
    resetToHome: resetToHome
};

// 全局函数，用于向后兼容
window.fillAndSearch = fillAndSearch;
window.fillAndSearchWithDouban = fillAndSearchWithDouban;
window.updateDoubanVisibility = updateDoubanVisibility;
window.resetToHome = resetToHome;

// 加载豆瓣首页内容
document.addEventListener('DOMContentLoaded', initDouban); 
