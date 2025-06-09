// 默认选中的API源
const DEFAULT_API_KEYS = ['heimuer', 'dyttzy', 'ruyi', 'bfzy', 'tyyszy', 'ffzy', 'zy360', 'iqiyi', 'wolong', 'hwba', 'jisu', 'dbzy', 'mozhua', 'mdzy', 'zuid', 'yinghua', 'baidu', 'wujin', 'wwzy', 'ikun'];

// 获取选中的API源
function getSelectedAPIs() {
    const selectedApis = localStorage.getItem('selectedApis');
    return selectedApis ? JSON.parse(selectedApis) : DEFAULT_API_KEYS;
}

// 保存选中的API源
function saveSelectedAPIs(apis) {
    localStorage.setItem('selectedApis', JSON.stringify(apis));
}

// 显示加载提示
function showLoading(message = '加载中...') {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.textContent = message;
        loadingElement.classList.remove('hidden');
    }
}

// 隐藏加载提示
function hideLoading() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.classList.add('hidden');
    }
}

// 显示提示信息
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg text-white z-50 ${
        type === 'error' ? 'bg-red-500' :
        type === 'success' ? 'bg-green-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 导出函数
export {
    DEFAULT_API_KEYS,
    getSelectedAPIs,
    saveSelectedAPIs,
    showLoading,
    hideLoading,
    showToast
}; 
