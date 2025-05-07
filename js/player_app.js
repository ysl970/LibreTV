// =================================
// ============== PLAYER ==========
// =================================
// 全局变量
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let currentEpisodes = [];
let episodesReversed = false;
let dp = null;
let currentHls = null; // 跟踪当前HLS实例
let autoplayEnabled = true; // 默认自动播放启用
let isUserSeeking = false; // 跟踪用户是否正在拖动进度条
let videoHasEnded = false; // 跟踪视频是否自然结束
let userClickedPosition = null; // 记录用户点击位置
let shortcutHintTimeout = null; // 用于控制快捷键提示显示时间
let adFilteringEnabled = true; // 默认广告过滤启用
let progressSaveInterval = null; // 定时保存进度的计时器

// 页面加载
document.addEventListener('DOMContentLoaded', function() {
    // 首先检查用户是否通过密码验证
    if (!isPasswordVerified()) {
        // 隐藏加载指示器
        document.getElementById('loading').style.display = 'none';
        return;
    }

    initializePageContent();
});

// 监听密码验证成功事件
document.addEventListener('passwordVerified', () => {
    document.getElementById('loading').style.display = 'block';
    initializePageContent();
});

// 初始化页面内容
function initializePageContent() {
    // 解析URL参数
    const urlParams = new URLSearchParams(window.location.search);
    const videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = urlParams.get('source_code');
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes'); // 新增：从URL获取剧集信息

    // 从localStorage获取数据
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    currentEpisodeIndex = index;
    
    // 设置自动播放开关状态
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // 默认为true
    document.getElementById('autoplay-next').checked = autoplayEnabled;
    
    // 获取广告过滤设置
    adFilteringEnabled = localStorage.getItem('adFilteringEnabled') !== 'false'; // 默认为true
    
    // 监听自动播放开关变化
    document.getElementById('autoplay-next').addEventListener('change', function(e) {
        autoplayEnabled = e.target.checked;
        localStorage.setItem('autoplayEnabled', autoplayEnabled);
    });
    
    // 设置自定义播放器控制按钮
    setupCustomPlayerControls();

    // 尝试获取剧集列表
    try {
        // 首先尝试从URL参数获取
        if (episodesList) {
            currentEpisodes = JSON.parse(decodeURIComponent(episodesList));
        } 
        // 如果不可用，尝试从localStorage获取
        else {
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
        }
        
        // 验证索引
        if (index < 0 || index >= currentEpisodes.length) {
            index = 0;
            // 更新URL中的索引
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl);
        }
        
        // 更新当前索引为验证后的值
        currentEpisodeIndex = index;
        
        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        console.error('获取剧集信息失败:', e);
        currentEpisodes = [];
        currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    // 设置页面标题
    document.title = currentVideoTitle + ' - LibreTV';
    document.getElementById('video-title').textContent = currentVideoTitle;

    // 初始化播放器
    if (videoUrl) {
        initPlayer(videoUrl, sourceCode);
        
        // 尝试从URL参数恢复播放位置
        const position = urlParams.get('position');
        if (position) {
            setTimeout(() => {
                if (dp && dp.video) {
                    const positionNum = parseInt(position);
                    if (!isNaN(positionNum) && positionNum > 0) {
                        dp.seek(positionNum);
                        showPositionRestoreHint(positionNum);
                    }
                }
            }, 1500);
        }
    } else {
        showError('无效的视频链接');
    }

    // 更新剧集信息
    updateEpisodeInfo();
    
    // 渲染剧集列表
    renderEpisodes();
    
    // 更新按钮状态
    updateButtonStates();
    
    // 更新排序按钮状态
    updateOrderButton();

    // 为进度条添加监听器以实现精确定位
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000);
    
    // 设置自定义播放器控制按钮
    setupCustomPlayerControls();

    // 添加键盘快捷键事件监听器
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // 添加页面离开事件监听器以保存播放位置
    window.addEventListener('beforeunload', saveCurrentProgress);

    // 新增：当页面隐藏时也保存进度（背景/标签切换）
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // 新增：当视频暂停时也保存进度
    // 需要确保dp.video已初始化
    const waitForVideo = setInterval(() => {
        if (dp && dp.video) {
            dp.video.addEventListener('pause', saveCurrentProgress);
            clearInterval(waitForVideo);
        }
    }, 500);
}

// 处理键盘快捷键
function handleKeyboardShortcuts(e) {
    // 仅在播放器存在且不在输入字段中时处理
    if (dp && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        // 左箭头：后退5秒
        if (e.key === 'ArrowLeft') {
            dp.seek(Math.max(0, dp.video.currentTime - 5));
            showShortcutHint('后退 5秒', 'left');
            e.preventDefault();
        }
        // 右箭头：前进5秒
        else if (e.key === 'ArrowRight') {
            dp.seek(Math.min(dp.video.duration, dp.video.currentTime + 5));
            showShortcutHint('前进 5秒', 'right');
            e.preventDefault();
        }
        // Page Up：上一集
        else if (e.key === 'PageUp') {
            playPreviousEpisode();
            showShortcutHint('上一集', 'left');
            e.preventDefault();
        }
        // Page Down：下一集
        else if (e.key === 'PageDown') {
            playNextEpisode();
            showShortcutHint('下一集', 'right');
            e.preventDefault();
        }
    }
}

// 显示快捷键提示
function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcut-hint');
    
    // 清除之前的超时
    if (shortcutHintTimeout) {
        clearTimeout(shortcutHintTimeout);
    }
    
    // 设置文本和方向
    const keyElement = document.getElementById('shortcut-key');
    const actionElement = document.getElementById('shortcut-action');
    
    if (keyElement && actionElement) {
        if (direction === 'left') {
            keyElement.innerHTML = '◀';
            keyElement.className = 'shortcut-left';
        } else if (direction === 'right') {
            keyElement.innerHTML = '▶';
            keyElement.className = 'shortcut-right';
        }
        
        actionElement.textContent = text;
    }
    
    // 显示提示
    hintElement.classList.add('show');
    
    // 设置超时以隐藏提示
    shortcutHintTimeout = setTimeout(() => {
        hintElement.classList.remove('show');
    }, 1500);
}

// 设置长按速度控制（移动端）
function setupLongPressSpeedControl() {
    if (!dp) return;
    
    const playerElement = document.querySelector('.dplayer-video-wrap');
    if (!playerElement) return;
    
    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChanged = false;
    
    // 触摸开始
    playerElement.addEventListener('touchstart', function(e) {
        // 仅在视频区域的右侧处理
        const touchX = e.touches[0].clientX;
        const rect = playerElement.getBoundingClientRect();
        const isRightSide = touchX > (rect.left + rect.width / 2);
        
        if (isRightSide) {
            // 保存原始速度
            originalSpeed = dp.video.playbackRate;
            
            // 设置长按计时器
            longPressTimer = setTimeout(() => {
                // 增加播放速度
                dp.speed(2.0);
                speedChanged = true;
                
                // 显示速度提示
                showMessage('播放速度: 2.0x', 'info');
            }, 500);
        }
    });
    
    // 触摸结束
    playerElement.addEventListener('touchend', function() {
        // 清除计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 如果速度已更改，恢复原始速度
        if (speedChanged) {
            dp.speed(originalSpeed);
            speedChanged = false;
            
            // 显示速度提示
            showMessage(`播放速度: ${originalSpeed}x`, 'info');
        }
    });
    
    // 触摸取消
    playerElement.addEventListener('touchcancel', function() {
        // 清除计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 如果速度已更改，恢复原始速度
        if (speedChanged) {
            dp.speed(originalSpeed);
            speedChanged = false;
        }
    });
}

// 初始化播放器
function initPlayer(videoUrl, sourceCode) {
    if (!videoUrl) return;
    
    // 配置HLS.js选项
    const hlsConfig = {
        debug: false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true,
        appendErrorMaxRetry: 5,  // 增加重试次数
        liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };
    
    // 创建DPlayer实例
    dp = new DPlayer({
        container: document.getElementById('dplayer'),
        autoplay: true,
        theme: '#00ccff',
        preload: 'auto',
        loop: false,
        lang: 'zh-cn',
        hotkey: true,        // 启用键盘控制，包括空格暂停/播放，箭头键控制进度和音量
        mutex: true,
        volume: 0.7,
        screenshot: true,                // 启用截图功能
        preventClickToggle: false,       // 允许点击视频切换播放/暂停
        airplay: true,                   // 在Safari中启用AirPlay
        chromecast: true,                // 启用Chromecast
        video: {
            url: videoUrl,
            type: 'hls',
            pic: 'https://img.picgo.net/2025/04/12/image362e7d38b4af4a74.png', // 设置视频封面图
            customType: {
                hls: function(video, player) {
                    // 清理之前的HLS实例
                    if (currentHls && currentHls.destroy) {
                        try {
                            currentHls.destroy();
                        } catch (e) {
                            console.warn('销毁旧HLS实例时出错:', e);
                        }
                    }
                    
                    // 创建新的HLS实例
                    const hls = new Hls(hlsConfig);
                    currentHls = hls;
                    
                    // 跟踪是否已显示错误
                    let errorDisplayed = false;
                    // 跟踪错误计数
                    let errorCount = 0;
                    // 跟踪视频是否已开始播放
                    let playbackStarted = false;
                    // 跟踪缓冲区追加错误
                    let bufferAppendErrorCount = 0;
                    
                    // 监听视频播放事件
                    video.addEventListener('playing', function() {
                        playbackStarted = true;
                        document.getElementById('loading').style.display = 'none';
                        document.getElementById('error').style.display = 'none';
                    });
                    
                    // 加载视频源
                    hls.loadSource(video.src);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MEDIA_ATTACHED, function() {
                        video.muted = false;
                        video.play();
                    });
                    
                    // 错误处理
                    hls.on(Hls.Events.ERROR, function(event, data) {
                        errorCount++;
                        
                        if (data.fatal) {
                            console.error('致命HLS错误:', data);
                            
                            // 尝试从错误中恢复
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log("尝试恢复网络错误");
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log("尝试恢复媒体错误");
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    // 仅在多次恢复尝试后显示错误
                                    if (errorCount > 3 && !errorDisplayed) {
                                        errorDisplayed = true;
                                        showError('视频加载失败，格式可能不兼容或源不可用');
                                    }
                                    break;
                            }
                        }
                    });
                    
                    // 监控片段加载事件
                    hls.on(Hls.Events.FRAG_LOADED, function() {
                        document.getElementById('loading').style.display = 'none';
                    });
                    
                    // 监控级别加载事件
                    hls.on(Hls.Events.LEVEL_LOADED, function() {
                        document.getElementById('loading').style.display = 'none';
                    });
                }
            }
        }
    });
    
    // 全屏模式下锁定横屏
    dp.on('fullscreen', () => {
        if (window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape')
            .then(() => {
                console.log('屏幕已锁定为横屏模式');
            })
            .catch((error) => {
                console.warn('无法锁定屏幕方向，请手动旋转设备:', error);
            });
        } else {
            console.warn('当前浏览器不支持锁定屏幕方向，请手动旋转设备。');
        }
    });
    
    // 退出全屏时解锁屏幕方向
    dp.on('fullscreen_cancel', () => {
        if (window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
        }
    });
    
    dp.on('loadedmetadata', function() {
        document.getElementById('loading').style.display = 'none';
        videoHasEnded = false; // 视频加载时重置结束标志
        
        // 视频加载后重置进度条点击监听器
        setupProgressBarPreciseClicks();
        
        // 视频成功加载后添加到观看历史
        setTimeout(saveToHistory, 3000);
        
        // 开始定期保存进度
        startProgressSaveInterval();
    });

    dp.on('error', function() {
        // 检查视频是否已经在播放
        if (dp.video && dp.video.currentTime > 1) {
            console.log('发生错误，但视频已经在播放，忽略');
            return;
        }
        showError('视频播放失败，请检查视频源或网络连接');
    });

    // 添加移动端长按速度控制
    setupLongPressSpeedControl();
    
    // 添加seeking和seeked事件监听器以检测用户是否正在拖动进度条
    dp.on('seeking', function() {
        isUserSeeking = true;
    });
    
    dp.on('seeked', function() {
        isUserSeeking = false;
    });
    
    // 处理视频结束事件
    dp.on('ended', function() {
        videoHasEnded = true;
        
        // 保存最终进度
        saveCurrentProgress();
        
        // 如果启用了自动播放，播放下一集
        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            // 播放下一集前添加轻微延迟
            setTimeout(() => {
                playNextEpisode();
            }, 1500);
        }
    });
    
    // 设置加载指示器超时
    setTimeout(() => {
        // 如果视频在10秒后仍未开始播放，显示扩展加载消息
        if (dp && dp.video && dp.video.readyState < 3) {
            const loadingEl = document.getElementById('loading');
            if (loadingEl && loadingEl.style.display !== 'none') {
                loadingEl.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div>仍在加载视频...</div>
                    <div style="font-size: 12px; color: #aaa; margin-top: 10px;">如果长时间无响应，请尝试其他视频源</div>
                `;
            }
        }
    }, 10000);

    // 绑定原生全屏：当DPlayer触发全屏时调用requestFullscreen
    (function(){
        const fsContainer = document.getElementById('player');
        dp.on('fullscreen', () => {
            if (fsContainer.requestFullscreen) {
                fsContainer.requestFullscreen().catch(err => console.warn('原生全屏失败:', err));
            }
        });
        dp.on('fullscreen_cancel', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        });
    })();
}

// 自定义M3U8加载器用于广告过滤
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        this.adFilteringEnabled = true;
    }
    
    load(context, config, callbacks) {
        // 检查是否为m3u8片段
        if (context.type === 'manifest' && this.adFilteringEnabled) {
            const origOnSuccess = callbacks.onSuccess;
            
            // 重写成功回调以过滤广告片段
            callbacks.onSuccess = (response, stats, context) => {
                if (response.data) {
                    // 过滤广告片段
                    response.data = this.filterAdSegments(response.data);
                }
                
                // 调用原始回调
                return origOnSuccess(response, stats, context);
            };
        }
        
        // 调用原始加载方法
        return super.load(context, config, callbacks);
    }
    
    // 过滤广告片段
    filterAdSegments(manifest) {
        if (typeof manifest !== 'string') return manifest;
        
        // 广告特征标记
        const adMarkers = [
            'ad', 'ads', 'advert', 'advertisement', 'guanggao', 'guangao', 
            '广告', '廣告', 'sponsor', 'promotion', 'promo'
        ];
        
        // 分割行
        const lines = manifest.split('\n');
        const filteredLines = [];
        let skipNextSegment = false;
        
        // 处理每一行
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 检查是否为广告标记
            const isAdMarker = adMarkers.some(marker => 
                line.toLowerCase().includes(marker.toLowerCase())
            );
            
            // 如果是广告标记，设置标志跳过下一个片段
            if (isAdMarker) {
                skipNextSegment = true;
                continue;
            }
            
            // 如果是片段URL且需要跳过
            if (skipNextSegment && (line.startsWith('http') || line.includes('.ts'))) {
                skipNextSegment = false;
                continue;
            }
            
            // 保留非广告行
            filteredLines.push(line);
        }
        
        return filteredLines.join('\n');
    }
}

// 显示错误
function showError(message) {
    // 如果视频已经在播放，不显示错误
    if (dp && dp.video && dp.video.currentTime > 5) {
        console.warn('忽略错误，因为视频已经在播放:', message);
        return;
    }
    
    // 隐藏加载指示器
    document.getElementById('loading').style.display = 'none';
    
    // 显示错误容器
    const errorElement = document.getElementById('error');
    
    // 更新错误消息
    if (errorElement.querySelector('.text-xl')) {
        errorElement.querySelector('.text-xl').textContent = message;
    }
    
    // 显示错误容器
    errorElement.style.display = 'flex';
    
    // 显示错误消息提示
    showMessage(message, 'error');
}

// 设置进度条精确点击
function setupProgressBarPreciseClicks() {
    if (!dp) return;
    
    // 获取进度条元素
    const progressBar = document.querySelector('.dplayer-bar-wrap');
    if (!progressBar) {
        console.warn('未找到进度条元素');
        return;
    }
    
    // 移除现有监听器（如果有）
    progressBar.removeEventListener('click', handleProgressBarClick);
    progressBar.removeEventListener('touchend', handleProgressBarTouch);
    
    // 添加点击监听器
    progressBar.addEventListener('click', handleProgressBarClick);
    
    // 为移动端添加触摸监听器
    progressBar.addEventListener('touchend', handleProgressBarTouch);
    
    // 添加点击事件监听器
    progressBar.addEventListener('click', function(e) {
        // 记录用户点击位置
        userClickedPosition = {
            x: e.clientX,
            time: Date.now()
        };
    });
    
    // 监听进度变化事件
    dp.on('seeking', function() {
        // 如果是用户点击引起的seeking，显示时间提示
        if (userClickedPosition && (Date.now() - userClickedPosition.time < 200)) {
            // 清除用户点击记录
            userClickedPosition = null;
        }
    });
}

// 处理进度条点击
function handleProgressBarClick(e) {
    if (!dp || !dp.video) return;
    
    // 获取进度条尺寸
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const width = rect.width;
    
    // 计算百分比和时间
    const percentage = offsetX / width;
    const duration = dp.video.duration;
    const clickTime = percentage * duration;
    
    // 记录用户点击位置
    userClickedPosition = clickTime;
    
    // 设置视频时间
    dp.seek(clickTime);
}

// 处理进度条触摸
function handleProgressBarTouch(e) {
    if (!dp || !dp.video || !e.changedTouches || !e.changedTouches[0]) return;
    
    // 获取进度条尺寸
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const offsetX = touch.clientX - rect.left;
    const width = rect.width;
    
    // 计算百分比和时间
    const percentage = Math.max(0, Math.min(1, offsetX / width));
    const duration = dp.video.duration;
    const touchTime = percentage * duration;
    
    // 记录用户点击位置
    userClickedPosition = touchTime;
    
    // 设置视频时间
    dp.seek(touchTime);
}

// 设置长按速度控制
function setupLongPressSpeedControl() {
    if (!dp) return;
    
    const playerElement = document.querySelector('.dplayer-video-wrap');
    if (!playerElement) return;
    
    let longPressTimer = null;
    let originalSpeed = 1.0;
    let speedChanged = false;
    
    // 触摸开始
    playerElement.addEventListener('touchstart', function(e) {
        // 仅在视频区域的右侧处理
        const touchX = e.touches[0].clientX;
        const rect = playerElement.getBoundingClientRect();
        const isRightSide = touchX > (rect.left + rect.width / 2);
        
        if (isRightSide) {
            // 保存原始速度
            originalSpeed = dp.video.playbackRate;
            
            // 设置长按计时器
            longPressTimer = setTimeout(() => {
                // 增加播放速度
                dp.speed(2.0);
                speedChanged = true;
                
                // 显示速度提示
                showMessage('播放速度: 2.0x', 'info');
            }, 500);
        }
    });
    
    // 触摸结束
    playerElement.addEventListener('touchend', function() {
        // 清除计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 如果速度已更改，恢复原始速度
        if (speedChanged) {
            dp.speed(originalSpeed);
            speedChanged = false;
            
            // 显示速度提示
            showMessage(`播放速度: ${originalSpeed}x`, 'info');
        }
    });
    
    // 触摸取消
    playerElement.addEventListener('touchcancel', function() {
        // 清除计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        // 如果速度已更改，恢复原始速度
        if (speedChanged) {
            dp.speed(originalSpeed);
            speedChanged = false;
        }
    });
}

// 显示位置恢复提示
function showPositionRestoreHint(position) {
    // 格式化时间
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // 显示消息
    showMessage(`已恢复到 ${formattedTime}`, 'info');
}

// 显示消息提示
function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    
    // 设置消息类型样式
    let bgColor = '';
    switch (type) {
        case 'error':
            bgColor = 'bg-red-500';
            break;
        case 'success':
            bgColor = 'bg-green-500';
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-500';
            break;
    }
    
    // 设置消息样式
    messageElement.className = `fixed top-4 right-4 p-4 rounded shadow-lg z-50 ${bgColor} text-white`;
    messageElement.textContent = text;
    messageElement.style.display = 'block';
    
    // 设置超时以隐藏消息
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, duration);
}

// 渲染剧集列表
function renderEpisodes() {
    const episodesContainer = document.getElementById('episodes-container');
    const episodeGrid = document.getElementById('episode-grid');
    
    if (!episodesContainer || !episodeGrid || !currentEpisodes || currentEpisodes.length <= 1) {
        if (episodesContainer) episodesContainer.classList.add('hidden');
        return;
    }
    
    // 显示剧集容器
    episodesContainer.classList.remove('hidden');
    
    // 清空现有内容
    episodeGrid.innerHTML = '';
    
    // 获取要显示的剧集列表（考虑排序）
    const displayEpisodes = episodesReversed ? [...currentEpisodes].reverse() : [...currentEpisodes];
    
    // 渲染每个剧集按钮
    displayEpisodes.forEach((url, idx) => {
        // 计算真实索引（考虑排序）
        const realIndex = episodesReversed ? (currentEpisodes.length - 1 - idx) : idx;
        
        // 创建剧集按钮
        const episodeButton = document.createElement('button');
        episodeButton.className = `episode-button ${realIndex === currentEpisodeIndex ? 'active' : ''}`;
        episodeButton.textContent = `${idx + 1}`;
        episodeButton.title = `第 ${idx + 1} 集`;
        episodeButton.setAttribute('data-index', realIndex);
        
        // 添加点击事件
        episodeButton.addEventListener('click', () => {
            playEpisode(realIndex);
        });
        
        // 添加到网格
        episodeGrid.appendChild(episodeButton);
    });
}

// 更新剧集信息显示
function updateEpisodeInfo() {
    const episodeTitle = document.getElementById('episode-title');
    if (!episodeTitle) return;
    
    if (currentEpisodes && currentEpisodes.length > 1) {
        const totalEpisodes = currentEpisodes.length;
        const currentNumber = currentEpisodeIndex + 1;
        episodeTitle.textContent = `第 ${currentNumber} 集 / 共 ${totalEpisodes} 集`;
    } else {
        episodeTitle.textContent = '';
    }
}

// 切换剧集排序（正序/倒序）
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed);
    
    // 更新排序按钮状态
    updateOrderButton();
    
    // 重新渲染剧集列表
    renderEpisodes();
}

// 更新排序按钮状态
function updateOrderButton() {
    const orderButton = document.getElementById('order-button');
    if (!orderButton) return;
    
    if (episodesReversed) {
        orderButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
            </svg>
            <span>正序排列</span>
        `;
    } else {
        orderButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
            </svg>
            <span>倒序排列</span>
        `;
    }
}

// 播放指定剧集
function playEpisode(index) {
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) return;
    
    // 保存当前进度
    saveCurrentProgress();
    
    // 更新当前索引
    currentEpisodeIndex = index;
    
    // 更新URL参数
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('index', index);
    window.history.replaceState({}, '', newUrl);
    
    // 更新剧集信息
    updateEpisodeInfo();
    
    // 更新按钮状态
    updateButtonStates();
    
    // 重新渲染剧集列表以更新活动状态
    renderEpisodes();
    
    // 加载新视频
    const videoUrl = currentEpisodes[index];
    if (videoUrl) {
        // 显示加载指示器
        document.getElementById('loading').style.display = 'flex';
        
        // 更新播放器源
        if (dp) {
            dp.switchVideo({
                url: videoUrl,
                type: 'hls'
            });
            
            // 重置视频结束标志
            videoHasEnded = false;
        }
    }
}

// 播放上一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    } else {
        showMessage('已经是第一集了', 'info');
    }
}

// 播放下一集
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    } else {
        showMessage('已经是最后一集了', 'info');
    }
}

// 更新按钮状态（上一集/下一集）
function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    
    if (prevButton) {
        prevButton.disabled = currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', currentEpisodeIndex <= 0);
    }
    
    if (nextButton) {
        nextButton.disabled = currentEpisodeIndex >= currentEpisodes.length - 1;
        nextButton.classList.toggle('opacity-50', currentEpisodeIndex >= currentEpisodes.length - 1);
    }
}

/**
 * Sets up custom player control buttons
 * Handles back button, fullscreen button, and episode navigation buttons
 */
function setupCustomPlayerControls() {
    // Back Button
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', function() {
            // Navigate back to index page
            window.location.href = 'index.html';
        });
    }
    
    // Fullscreen Button
    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', function() {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else {
                console.warn('DPlayer instance (dp) or its fullScreen API is not available for custom fullscreen button.');
                // Fallback to native browser fullscreen API for the main player container
                const playerDplayerContainer = document.getElementById('dplayer'); // DPlayer's direct container
                const playerOuterContainer = document.getElementById('player'); // The overall player section
                const fullscreenTarget = playerDplayerContainer || playerOuterContainer;

                if (fullscreenTarget) {
                    if (!document.fullscreenElement && 
                        !document.webkitFullscreenElement && 
                        !document.mozFullScreenElement && 
                        !document.msFullscreenElement) {
                        if (fullscreenTarget.requestFullscreen) {
                            fullscreenTarget.requestFullscreen().catch(err => console.error('Error attempting to enable full-screen mode:', err.message));
                        } else if (fullscreenTarget.webkitRequestFullscreen) {
                            fullscreenTarget.webkitRequestFullscreen().catch(err => console.error('Error attempting to enable full-screen mode (webkit):', err.message));
                        } // Add other vendor prefixes if needed (moz, ms)
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen().catch(err => console.error('Error attempting to disable full-screen mode:', err.message));
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen().catch(err => console.error('Error attempting to disable full-screen mode (webkit):', err.message));
                        } // Add other vendor prefixes
                    }
                }
            }
        });
    }
    
    // Episode Navigation Buttons
    const prevEpisodeButton = document.getElementById('prev-episode');
    if (prevEpisodeButton) {
        prevEpisodeButton.addEventListener('click', playPreviousEpisode);
    }
    
    const nextEpisodeButton = document.getElementById('next-episode');
    if (nextEpisodeButton) {
        nextEpisodeButton.addEventListener('click', playNextEpisode);
    }
    
    // Episode Order Button
    const orderButton = document.getElementById('order-button');
    if (orderButton) {
        orderButton.addEventListener('click', toggleEpisodeOrder);
    }
    
    // Retry Button for Error Container
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', function() {
            // Reload the current video
            if (dp) {
                dp.pause();
                dp.notice('正在重新加载视频...');
                
                // Get current video URL
                const currentUrl = currentEpisodes[currentEpisodeIndex];
                if (currentUrl) {
                    // Hide error message
                    document.getElementById('error').style.display = 'none';
                    // Show loading indicator
                    document.getElementById('loading').style.display = 'flex';
                    
                    // Reinitialize player with current URL
                    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || '';
                    setTimeout(() => {
                        initPlayer(currentUrl, sourceCode);
                    }, 500);
                }
            }
        });
    }
}

// 保存当前播放进度
function saveCurrentProgress() {
    if (!dp || !dp.video || isUserSeeking || videoHasEnded) return;
    
    const currentTime = dp.video.currentTime;
    const duration = dp.video.duration;
    
    // 只有当进度有效且不是视频结尾时才保存
    if (currentTime > 0 && duration > 0 && currentTime < duration * 0.95) {
        try {
            // 获取当前视频信息
            const videoInfo = {
                title: currentVideoTitle,
                url: currentEpisodes[currentEpisodeIndex],
                episodeIndex: currentEpisodeIndex,
                playbackPosition: Math.floor(currentTime),
                duration: Math.floor(duration),
                timestamp: Date.now()
            };
            
            // 保存到观看历史
            addToViewingHistory(videoInfo);
        } catch (e) {
            console.error('保存播放进度失败:', e);
        }
    }
}

// 开始定期保存进度的计时器
function startProgressSaveInterval() {
    // 清除现有计时器
    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
    }
    
    // 每30秒保存一次进度
    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

// 保存到观看历史
function saveToHistory() {
    if (!dp || !dp.video || !currentVideoTitle) return;
    
    try {
        // 获取当前视频信息
        const videoInfo = {
            title: currentVideoTitle,
            url: currentEpisodes[currentEpisodeIndex],
            episodeIndex: currentEpisodeIndex,
            episodes: currentEpisodes,
            playbackPosition: Math.floor(dp.video.currentTime),
            duration: Math.floor(dp.video.duration),
            timestamp: Date.now(),
            sourceCode: new URLSearchParams(window.location.search).get('source_code') || ''
        };
        
        // 添加到观看历史
        addToViewingHistory(videoInfo);
    } catch (e) {
        console.error('保存到历史记录失败:', e);
    }
}

// 添加到观看历史
function addToViewingHistory(videoInfo) {
    try {
        // 获取现有历史
        let history = [];
        const historyRaw = localStorage.getItem('viewingHistory');
        if (historyRaw) {
            history = JSON.parse(historyRaw);
        }
        
        // 查找是否已存在相同标题的记录
        const existingIndex = history.findIndex(item => item.title === videoInfo.title);
        
        if (existingIndex !== -1) {
            // 更新现有记录
            const existing = history[existingIndex];
            
            // 保存剧集列表（如果有）
            if (videoInfo.episodes && videoInfo.episodes.length) {
                existing.episodes = videoInfo.episodes;
            }
            
            // 更新时间戳
            existing.timestamp = videoInfo.timestamp;
            
            // 更新播放位置和时长
            existing.playbackPosition = videoInfo.playbackPosition;
            existing.duration = videoInfo.duration;
            
            // 更新剧集索引
            existing.episodeIndex = videoInfo.episodeIndex;
            
            // 更新源代码（如果有）
            if (videoInfo.sourceCode) {
                existing.sourceCode = videoInfo.sourceCode;
            }
            
            // 移动到列表顶部
            history.splice(existingIndex, 1);
            history.unshift(existing);
        } else {
            // 添加新记录
            history.unshift(videoInfo);
        }
        
        // 限制历史记录数量
        const HISTORY_MAX_ITEMS = 50;
        if (history.length > HISTORY_MAX_ITEMS) {
            history = history.slice(0, HISTORY_MAX_ITEMS);
        }
        
        // 保存回localStorage
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
        console.error('添加到观看历史失败:', e);
    }
}

// 清除观看历史
function clearViewingHistory() {
    try {
        localStorage.removeItem('viewingHistory');
        return true;
    } catch (e) {
        console.error('清除观看历史失败:', e);
        return false;
    }
}

// 显示恢复播放位置提示
function showPositionRestoreHint(position) {
    if (!position || position < 10) return;
    
    const hintElement = document.querySelector('.position-restore-hint');
    if (!hintElement) return;
    
    // 格式化时间
    const minutes = Math.floor(position / 60);
    const seconds = Math.floor(position % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // 设置提示文本
    hintElement.textContent = `已恢复到 ${formattedTime}`;
    
    // 显示提示
    hintElement.classList.add('show');
    
    // 设置超时以隐藏提示
    setTimeout(() => {
        hintElement.classList.remove('show');
    }, 3000);
}

// 显示消息提示
function showMessage(text, type = 'info', duration = 3000) {
    const messageElement = document.getElementById('message');
    if (!messageElement) return;
    
    // 设置消息类型样式
    let bgColor = '';
    switch (type) {
        case 'error':
            bgColor = 'bg-red-500';
            break;
        case 'success':
            bgColor = 'bg-green-500';
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-500';
            break;
    }
    
    // 设置消息样式
    messageElement.className = `fixed top-4 right-4 p-4 rounded shadow-lg z-50 ${bgColor} text-white`;
    messageElement.textContent = text;
    messageElement.style.display = 'block';
    
    // 设置超时以隐藏消息
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, duration);
}

// 渲染剧集列表
function renderEpisodes() {
    const episodesContainer = document.getElementById('episodes-container');
    const episodeGrid = document.getElementById('episode-grid');
    
    if (!episodesContainer || !episodeGrid || !currentEpisodes || currentEpisodes.length <= 1) {
        if (episodesContainer) episodesContainer.classList.add('hidden');
        return;
    }
    
    // 显示剧集容器
    episodesContainer.classList.remove('hidden');
    
    // 清空现有内容
    episodeGrid.innerHTML = '';
    
    // 获取要显示的剧集列表（考虑排序）
    const displayEpisodes = episodesReversed ? [...currentEpisodes].reverse() : [...currentEpisodes];
    
    // 渲染每个剧集按钮
    displayEpisodes.forEach((url, idx) => {
        // 计算真实索引（考虑排序）
        const realIndex = episodesReversed ? (currentEpisodes.length - 1 - idx) : idx;
        
        // 创建剧集按钮
        const episodeButton = document.createElement('button');
        episodeButton.className = `episode-button ${realIndex === currentEpisodeIndex ? 'active' : ''}`;
        episodeButton.textContent = `${idx + 1}`;
        episodeButton.title = `第 ${idx + 1} 集`;
        episodeButton.setAttribute('data-index', realIndex);
        
        // 添加点击事件
        episodeButton.addEventListener('click', () => {
            playEpisode(realIndex);
        });
        
        // 添加到网格
        episodeGrid.appendChild(episodeButton);
    });
}

// 更新剧集信息显示
function updateEpisodeInfo() {
    const episodeTitle = document.getElementById('episode-title');
    if (!episodeTitle) return;
    
    if (currentEpisodes && currentEpisodes.length > 1) {
        const totalEpisodes = currentEpisodes.length;
        const currentNumber = currentEpisodeIndex + 1;
        episodeTitle.textContent = `第 ${currentNumber} 集 / 共 ${totalEpisodes} 集`;
    } else {
        episodeTitle.textContent = '';
    }
}

// 切换剧集排序（正序/倒序）
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    localStorage.setItem('episodesReversed', episodesReversed);
    
    // 更新排序按钮状态
    updateOrderButton();
    
    // 重新渲染剧集列表
    renderEpisodes();
}

// 更新排序按钮状态
function updateOrderButton() {
    const orderButton = document.getElementById('order-button');
    if (!orderButton) return;
    
    if (episodesReversed) {
        orderButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
            </svg>
            <span>正序排列</span>
        `;
    } else {
        orderButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
            </svg>
            <span>倒序排列</span>
        `;
    }
}

// 播放指定剧集
function playEpisode(index) {
    if (!currentEpisodes || index < 0 || index >= currentEpisodes.length) return;
    
    // 保存当前进度
    saveCurrentProgress();
    
    // 更新当前索引
    currentEpisodeIndex = index;
    
    // 更新URL参数
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('index', index);
    window.history.replaceState({}, '', newUrl);
    
    // 更新剧集信息
    updateEpisodeInfo();
    
    // 更新按钮状态
    updateButtonStates();
    
    // 重新渲染剧集列表以更新活动状态
    renderEpisodes();
    
    // 加载新视频
    const videoUrl = currentEpisodes[index];
    if (videoUrl) {
        // 显示加载指示器
        document.getElementById('loading').style.display = 'flex';
        
        // 更新播放器源
        if (dp) {
            dp.switchVideo({
                url: videoUrl,
                type: 'hls'
            });
            
            // 重置视频结束标志
            videoHasEnded = false;
        }
    }
}

// 播放上一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    } else {
        showMessage('已经是第一集了', 'info');
    }
}

// 播放下一集
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    } else {
        showMessage('已经是最后一集了', 'info');
    }
}

// 更新按钮状态（上一集/下一集）
function updateButtonStates() {
    const prevButton = document.getElementById('prev-episode');
    const nextButton = document.getElementById('next-episode');
    
    if (prevButton) {
        prevButton.disabled = currentEpisodeIndex <= 0;
        prevButton.classList.toggle('opacity-50', currentEpisodeIndex <= 0);
    }
    
    if (nextButton) {
        nextButton.disabled = currentEpisodeIndex >= currentEpisodes.length - 1;
        nextButton.classList.toggle('opacity-50', currentEpisodeIndex >= currentEpisodes.length - 1);
    }
}

/**
 * Sets up custom player control buttons
 * Handles back button, fullscreen button, and episode navigation buttons
 */
function setupCustomPlayerControls() {
    // Back Button
    const backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', function() {
            // Navigate back to index page
            window.location.href = 'index.html';
        });
    }
    
    // Fullscreen Button
    const fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', function() {
            if (dp && dp.fullScreen && typeof dp.fullScreen.toggle === 'function') {
                dp.fullScreen.toggle();
            } else {
                console.warn('DPlayer instance (dp) or its fullScreen API is not available for custom fullscreen button.');
                // Fallback to native browser fullscreen API for the main player container
                const playerDplayerContainer = document.getElementById('dplayer'); // DPlayer's direct container
                const playerOuterContainer = document.getElementById('player'); // The overall player section
                const fullscreenTarget = playerDplayerContainer || playerOuterContainer;

                if (fullscreenTarget) {
                    if (!document.fullscreenElement && 
                        !document.webkitFullscreenElement && 
                        !document.mozFullScreenElement && 
                        !document.msFullscreenElement) {
                        if (fullscreenTarget.requestFullscreen) {
                            fullscreenTarget.requestFullscreen().catch(err => console.error('Error attempting to enable full-screen mode:', err.message));
                        } else if (fullscreenTarget.webkitRequestFullscreen) {
                            fullscreenTarget.webkitRequestFullscreen().catch(err => console.error('Error attempting to enable full-screen mode (webkit):', err.message));
                        } // Add other vendor prefixes if needed (moz, ms)
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen().catch(err => console.error('Error attempting to disable full-screen mode:', err.message));
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen().catch(err => console.error('Error attempting to disable full-screen mode (webkit):', err.message));
                        } // Add other vendor prefixes
                    }
                }
            }
        });
    }
    
    // Episode Navigation Buttons
    const prevEpisodeButton = document.getElementById('prev-episode');
    if (prevEpisodeButton) {
        prevEpisodeButton.addEventListener('click', playPreviousEpisode);
    }
    
    const nextEpisodeButton = document.getElementById('next-episode');
    if (nextEpisodeButton) {
        nextEpisodeButton.addEventListener('click', playNextEpisode);
    }
    
    // Episode Order Button
    const orderButton = document.getElementById('order-button');
    if (orderButton) {
        orderButton.addEventListener('click', toggleEpisodeOrder);
    }
    
    // Retry Button for Error Container
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', function() {
            // Reload the current video
            if (dp) {
                dp.pause();
                dp.notice('正在重新加载视频...');
                
                // Get current video URL
                const currentUrl = currentEpisodes[currentEpisodeIndex];
                if (currentUrl) {
                    // Hide error message
                    document.getElementById('error').style.display = 'none';
                    // Show loading indicator
                    document.getElementById('loading').style.display = 'flex';
                    
                    // Reinitialize player with current URL
                    const sourceCode = new URLSearchParams(window.location.search).get('source_code') || '';
                    setTimeout(() => {
                        initPlayer(currentUrl, sourceCode);
                    }, 500);
                }
            }
        });
    }
}
