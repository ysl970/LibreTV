// File: js/player_preload.js

/**
 * 集数预加载功能 (Episode Preloading Feature)
 */
(function() {
    function getPreloadCount() {
        return (window.PLAYER_CONFIG && typeof window.PLAYER_CONFIG.preloadCount !== 'undefined')
            ? parseInt(window.PLAYER_CONFIG.preloadCount, 10)
            : 2;
    }

    function supportsCacheStorage() {
        return 'caches' in window && typeof window.caches.open === 'function';
    }

    function isSlowNetwork() {
        try {
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return connection && connection.effectiveType && /2g|slow-2g/i.test(connection.effectiveType);
        } catch (e) {
            return false;
        }
    }

    async function preloadNextEpisodeParts(count) {
        const preloadCount = typeof count === 'number' ? count : getPreloadCount();

        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Preloading disabled by config.');
            return;
        }
        if (isSlowNetwork()) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Skipping preloading due to slow network.');
            return;
        }

        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || 
            typeof window.currentEpisodeIndex !== 'number' || window.currentEpisodes.length === 0) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                console.log('[Preload] Skipping: currentEpisodes or currentEpisodeIndex not properly set on window or empty.');
            }
            return;
        }

        const currentIndex = window.currentEpisodeIndex;
        const totalEpisodes = window.currentEpisodes.length;
        
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
            const fromLog = currentIndex + 1 + 1; 
            const toLog = Math.min(currentIndex + 1 + preloadCount, totalEpisodes);
             if (fromLog <= toLog) {
                console.log(`[Preload] WILL PRELOAD episodes for current display index ${currentIndex + 1}. Targets (display index): ${fromLog} to ${toLog}.`);
            } else {
                console.log(`[Preload] NO episodes to preload for current display index ${currentIndex + 1}.`);
            }
        }

        for (let offset = 1; offset <= preloadCount; offset++) {
            const episodeIdxToPreload = currentIndex + offset;
            if (episodeIdxToPreload >= totalEpisodes) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Reached end of playlist at offset ${offset}. Index to preload: ${episodeIdxToPreload}`);
                break;
            }

            const nextEpisodeUrl = window.currentEpisodes[episodeIdxToPreload];
            if (!nextEpisodeUrl) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Skipped empty URL at episode index ${episodeIdxToPreload}.`);
                continue;
            }
            
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                 console.log(`[Preload] Attempting to preload M3U8 for episode index ${episodeIdxToPreload} (Display ${episodeIdxToPreload + 1}): ${nextEpisodeUrl}`);
            }

            try {
                const m3u8Response = await fetch(nextEpisodeUrl, { method: "GET", cache: "force-cache" });
                if (!m3u8Response.ok) {
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Failed to fetch M3U8 for ${nextEpisodeUrl}. Status: ${m3u8Response.status}`);
                    continue;
                }
                const m3u8Text = await m3u8Response.text();
                const tsUrls = [];
                const baseUrlForSegments = nextEpisodeUrl.substring(0, nextEpisodeUrl.lastIndexOf('/') + 1);
                
                m3u8Text.split('\n').forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith("#") && (trimmedLine.endsWith(".ts") || trimmedLine.includes(".ts?")) && tsUrls.length < 3) {
                        tsUrls.push(trimmedLine.startsWith("http") ? trimmedLine : baseUrlForSegments + trimmedLine);
                    }
                });

                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                    console.log(`[Preload] M3U8 for episode ${episodeIdxToPreload + 1} parsed. Found ${tsUrls.length} TS segments to preload:`, tsUrls);
                }

                for (const tsUrl of tsUrls) {
                     if (supportsCacheStorage()) {
                        try {
                            const cache = await caches.open('libretv-preload-segments-v1');
                            const cachedResponse = await cache.match(tsUrl);
                            if (!cachedResponse) {
                                const segmentResponse = await fetch(tsUrl, { method: "GET" });
                                if (segmentResponse.ok) {
                                    await cache.put(tsUrl, segmentResponse.clone());
                                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment CACHED: ${tsUrl}`);
                                } else if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                                    console.log(`[Preload] Failed to FETCH TS segment: ${tsUrl}`);
                                }
                            } else {
                                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS segment ALREADY IN CACHE: ${tsUrl}`);
                            }
                        } catch (cacheEx) {
                            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS caching FAILED for ${tsUrl}: ${cacheEx.message}`);
                        }
                    } else { 
                        try {
                            const segmentResponse = await fetch(tsUrl, { method: "GET" });
                             if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                                if (segmentResponse.ok) console.log(`[Preload] TS segment fetched (no cache support): ${tsUrl}`);
                                else console.log(`[Preload] Failed to fetch TS segment (no cache support): ${tsUrl}`);
                            }
                        } catch (fetchEx) {
                             if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] TS fetch exception (no cache support) for ${tsUrl}: ${fetchEx.message}`);
                        }
                    }
                }
            } catch (e) {
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Error preloading M3U8 for ${nextEpisodeUrl}: ${e.message}`);
            }
        }
    }
    window.preloadNextEpisodeParts = preloadNextEpisodeParts;

    function safeRegisterPreloadEvents() {
        if (!(window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading)) {
            return;
        }
        if (!window.currentEpisodes || !Array.isArray(window.currentEpisodes) || typeof window.currentEpisodeIndex !== 'number') {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Deferring event registration, waiting for episode data.');
            setTimeout(safeRegisterPreloadEvents, 500);
            return;
        }

        const nextBtn = document.getElementById('next-episode');
        if (nextBtn && !nextBtn._preloadHooked_mouseenter_touchstart) {
            nextBtn._preloadHooked_mouseenter_touchstart = true;
            nextBtn.addEventListener('mouseenter', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            nextBtn.addEventListener('touchstart', () => preloadNextEpisodeParts(getPreloadCount()), { passive: true });
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Next button hover/touch events registered.');
        } else if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode && !nextBtn) {
             console.warn('[Preload] Next button with ID "next-episode" not found for event registration.');
        }


        function setupTimeUpdatePreloadListener() {
            if (window.dp && window.dp.video && typeof window.dp.video.addEventListener === 'function' && !window.dp._preloadHooked_timeupdate) {
                window.dp._preloadHooked_timeupdate = true;
                window.dp.video.addEventListener('timeupdate', function() {
                    if (window.dp.video.duration && window.dp.video.currentTime > window.dp.video.duration - 12) { // 12 seconds before end
                        preloadNextEpisodeParts(getPreloadCount());
                    }
                });
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Video timeupdate event for preloading registered.');
            }
        }

        if (window.dp && window.dp.video) {
            setupTimeUpdatePreloadListener();
        } else {
            let tries = 0;
            const timer = setInterval(() => {
                if (window.dp && window.dp.video) {
                    setupTimeUpdatePreloadListener();
                    clearInterval(timer);
                }
                if (++tries > 50) {
                     if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn('[Preload] DPlayer instance (dp.video) not found after 10s for timeupdate listener.');
                    clearInterval(timer);
                }
            }, 200);
        }

        const episodesListContainer = document.getElementById('episode-grid');
        if (episodesListContainer && !episodesListContainer._preloadHooked_click) {
            episodesListContainer._preloadHooked_click = true;
            // Event delegation for episode clicks is handled in player_app.js now, which calls playEpisode.
            // The enhanced playEpisode will trigger preloading.
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] Episode grid click preloading will be handled by enhanced playEpisode.');
        } else if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode && !episodesListContainer) {
            console.warn('[Preload] Episode grid with ID "episode-grid" not found for event registration.');
        }
    }

    function triggerFirstPreload(retryCount = 0) {
        if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.enablePreloading &&
            window.currentEpisodes && Array.isArray(window.currentEpisodes) && window.currentEpisodes.length > 0 &&
            typeof window.currentEpisodeIndex === 'number') {
            if (window.PLAYER_CONFIG.debugMode) console.log('[Preload] Triggering initial preload.');
            preloadNextEpisodeParts();
        } else if (retryCount < 20) {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Initial preload deferred (try ${retryCount + 1}), episode data not ready on window.`);
            setTimeout(() => triggerFirstPreload(retryCount + 1), 500);
        } else {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn('[Preload] Initial preload failed: episode data not available on window after multiple retries.');
        }
    }
    
    let enhancePlayEpisodeRetries = 0;
    function enhancePlayEpisodeForPreloading() {
        if (typeof window.playEpisode === 'function') {
            const originalPlayEpisode = window.playEpisode;
            if (!originalPlayEpisode._preloadEnhanced) {
                window.playEpisode = function(...args) {
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log(`[Preload] Wrapped playEpisode called. Original will run. New index: ${args[0]}`);
                    originalPlayEpisode.apply(this, args);
                    
                    // After originalPlayEpisode has (hopefully) updated window.currentEpisodeIndex
                    if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) {
                         console.log(`[Preload] Triggering preload after episode switch. Current window.currentEpisodeIndex: ${window.currentEpisodeIndex}`);
                    }
                    setTimeout(() => preloadNextEpisodeParts(getPreloadCount()), 250); // 250ms delay
                };
                window.playEpisode._preloadEnhanced = true;
                if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] playEpisode function enhanced for preloading.');
            }
        } else if (enhancePlayEpisodeRetries < 20) { // Retry up to 10 seconds
            enhancePlayEpisodeRetries++;
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.warn(`[Preload] window.playEpisode not found for enhancing (attempt ${enhancePlayEpisodeRetries}), will retry.`);
            setTimeout(enhancePlayEpisodeForPreloading, 500);
        } else {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.error('[Preload] Failed to enhance window.playEpisode after multiple retries.');
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Delay slightly to give player_app.js a chance to initialize its globals
        setTimeout(() => {
            if (window.PLAYER_CONFIG && window.PLAYER_CONFIG.debugMode) console.log('[Preload] DOMContentLoaded - Initializing preload systems.');
            safeRegisterPreloadEvents();
            triggerFirstPreload();
            enhancePlayEpisodeForPreloading();
        }, 800); // Increased delay slightly for player_app.js global setup
    });
})();