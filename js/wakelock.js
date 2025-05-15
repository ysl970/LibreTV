/**
 * Wake Lock API 工具函数
 * 用于防止设备屏幕在视频播放时自动关闭
 */

let wakeLock = null;

// 请求屏幕常亮锁
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');
      
      // 当页面可见性变化时处理
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return true;
    } catch (err) {
      console.error(`Wake Lock error: ${err.name}, ${err.message}`);
      return false;
    }
  } else {
    console.log('Wake Lock API not supported');
    return false;
  }
}

// 释放屏幕常亮锁
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release()
      .then(() => {
        console.log('Wake Lock released');
        wakeLock = null;
      })
      .catch((err) => {
        console.error(`Error releasing Wake Lock: ${err.name}, ${err.message}`);
      });
  }
}

// 处理页面可见性变化
async function handleVisibilityChange() {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    // 页面变为可见时，重新请求锁
    await requestWakeLock();
  }
}

// 自动在页面卸载时释放锁
window.addEventListener('beforeunload', () => {
  releaseWakeLock();
});
