// 全局常量配置
const PROXY_URL = '/proxy/';    // 适用于 Cloudflare, Netlify (带重写), Vercel (带重写)
// const HOPLAYER_URL = 'https://hoplayer.com/index.html';
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_HISTORY_ITEMS = 5;

// 密码保护配置
const PASSWORD_CONFIG = {
    localStorageKey: 'passwordVerified',  // 存储验证状态的键名
    verificationTTL: 60 * 60 * 1000,  // 验证有效期（30分钟）
};

// 网站信息配置
const SITE_CONFIG = {
    name: 'YTPPTV',
    url: 'https://tv.199908.top',
    description: '免费在线视频搜索与观看平台',
    logo: 'image/logo.png',
    version: '1.0.3'
};

// API站点配置 - 从共享文件中获取
// API_SITES 变量已在 api-sites.js 中定义

// 是否隐藏内置成人API
const HIDE_BUILTIN_ADULT_APIS = false;

// 添加聚合搜索的配置选项
const AGGREGATED_SEARCH_CONFIG = {
    enabled: true,             // 是否启用聚合搜索
    timeout: 8000,            // 单个源超时时间（毫秒）
    maxResults: 10000,          // 最大结果数量
    parallelRequests: true,   // 是否并行请求所有源
    showSourceBadges: true    // 是否显示来源徽章
};

// API配置
const API_CONFIG = {
    search: {
        path: '?ac=videolist&wd=',
        pagePath: '?ac=videolist&wd={query}&pg={page}',
        maxPages: 5, // 最多获取5页
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    },
    detail: {
        path: '?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    }
};

// 优化后的正则表达式模式
const M3U8_PATTERN = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;

// 添加自定义播放器URL
const CUSTOM_PLAYER_URL = 'player.html'; // 使用相对路径引用本地player.html

// 增加视频播放相关配置
const PLAYER_CONFIG = {
    autoplay: true,
    allowFullscreen: true,
    width: '100%',
    height: '600',
    timeout: 15000,  // 播放器加载超时时间
    filterAds: true,  // 是否启用广告过滤
    autoPlayNext: true,  // 默认启用自动连播功能
    adFilteringEnabled: true, // 默认开启分片广告过滤
    adFilteringStorage: 'adFilteringEnabled' // 存储广告过滤设置的键名
};

// 增加错误信息本地化
const ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR: 'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR: '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};

// 添加进一步安全设置
const SECURITY_CONFIG = {
    enableXSSProtection: true,  // 是否启用XSS保护
    sanitizeUrls: true,         // 是否清理URL
    maxQueryLength: 100,        // 最大搜索长度
    // allowedApiDomains 不再需要，因为所有请求都通过内部代理
};

// 添加多个自定义API源的配置
const CUSTOM_API_CONFIG = {
    separator: ',',           // 分隔符
    maxSources: 5,            // 最大允许的自定义源数量
    testTimeout: 5000,        // 测试超时时间(毫秒)
    namePrefix: 'Custom-',    // 自定义源名称前缀
    validateUrl: true,        // 验证URL格式
    cacheResults: true,       // 缓存测试结果
    cacheExpiry: 5184000000,  // 缓存过期时间(2个月)
    adultPropName: 'isAdult'  // 用于标记成人内容的属性名
};

// 添加视频历史记录配置
const HISTORY_CONFIG = {
    storageKey: 'viewingHistory',  // 存储键名
    maxItems: 50,                  // 最大历史记录数量
    expireDays: 30                 // 历史记录过期天数
};

// 添加豆瓣API配置和缓存机制
const DOUBAN_CONFIG = {
    // 缓存配置
    cache: {
        enabled: true,           // 是否启用缓存
        storageKey: 'doubanCache', // 本地存储键名
        expiry: 6 * 60 * 60 * 1000, // 缓存过期时间(6小时)
        maxItems: 20             // 每种类型最多缓存项数
    },
    // API配置
    api: {
        timeout: 8000,           // API请求超时时间(毫秒)
        primaryMirrors: [         // 主要API镜像列表(按优先级排序)
            '/proxy/https://movie.douban.com/j/search_subjects', // 通过本地代理(首选)
            'https://api.allorigins.win/get?url=' + encodeURIComponent('https://movie.douban.com/j/search_subjects') // 通过公共代理
        ],
        retryDelay: 1000,        // 重试延迟时间(毫秒)
        maxRetries: 2,           // 最大重试次数
        batchSize: 16            // 每批请求项数
    },
    // 默认初始配置
    defaults: {
        type: 'movie',           // 默认类型(电影)
        tag: '热门',              // 默认标签
        pageStart: 0,            // 默认起始页
        pageSize: 16             // 默认页大小
    },
    // 图片优化
    images: {
        lazyLoad: true,          // 是否启用懒加载
        placeholderImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"%3E%3Crect width="100" height="150" fill="%23222222"/%3E%3Ctext x="50" y="75" font-family="Arial" font-size="12" fill="%23ffffff" text-anchor="middle"%3E加载中...%3C/text%3E%3C/svg%3E',
        errorImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"%3E%3Crect width="100" height="150" fill="%23222222"/%3E%3Ctext x="50" y="75" font-family="Arial" font-size="12" fill="%23ffffff" text-anchor="middle"%3E加载失败%3C/text%3E%3C/svg%3E'
    }
};

// 搜索优化配置
const SEARCH_CONFIG = {
    debounceTime: 500,          // 搜索输入防抖时间(毫秒)
    minSearchLength: 2,          // 最小搜索长度
    preloadResults: true,        // 是否预加载结果
    resultCache: {
        enabled: true,           // 是否启用结果缓存
        storageKey: 'searchResultCache', // 本地存储键名
        expiry: 12 * 60 * 60 * 1000, // 缓存过期时间(12小时)
        maxItems: 20             // 最大缓存项数
    }
};

// 页面性能优化配置
const PERFORMANCE_CONFIG = {
    resourceHints: true,        // 是否启用资源提示(preconnect等)
    minifyHTML: true,           // 是否最小化HTML
    dynamicImport: true,        // 是否使用动态导入
    inlineImages: true,         // 是否内联小图片
    optimizeForFirstView: true, // 是否优化首屏加载
    loadPriority: {
        critical: ['config.js', 'app.js', 'styles.css'], // 关键资源
        high: ['api-sites.js'],  // 高优先级资源
        low: ['douban.js', 'wakelock.js'] // 低优先级资源
    }
};
