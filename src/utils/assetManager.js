const CACHE_NAME = 'interview-siege-assets-v1';

export const assetManager = {
  // Check if all game assets are cached
  async checkCacheStatus(assets) {
    if (!('caches' in window)) return false;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const cachedUrls = keys.map(request => request.url);
    
    return assets.every(asset => cachedUrls.includes(asset.url));
  },

  // Download all assets into browser cache
  async downloadAssets(assets, onProgress) {
    if (!('caches' in window)) {
      alert("Your browser doesn't support local caching.");
      return;
    }

    const cache = await caches.open(CACHE_NAME);
    let downloaded = 0;

    for (const asset of assets) {
      try {
        const response = await fetch(asset.url);
        if (response.ok) {
          await cache.put(asset.url, response);
        } else {
          console.warn(`Asset not found (404): ${asset.url}`);
        }
        downloaded++;
        if (onProgress) onProgress(Math.floor((downloaded / assets.length) * 100));
      } catch (error) {
        console.error(`Network error or CORS issue for: ${asset.url}`, error);
      }
    }
  },

  // Get a reliable placeholder if an asset fails
  getFallbackImage() {
    return 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000&auto=format&fit=crop'; // Tech/Cyber background
  },

  // Clear all cached assets
  async clearCache() {
    if (!('caches' in window)) return;
    await caches.delete(CACHE_NAME);
  }
};
