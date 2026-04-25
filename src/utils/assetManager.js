const CACHE_NAME = 'scenescoop-assets-v1';

export const assetManager = {
  // Check if all game images are cached
  async checkCacheStatus(scenes) {
    if (!('caches' in window)) return false;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const cachedUrls = keys.map(request => request.url);
    
    return scenes.every(scene => cachedUrls.includes(scene.image));
  },

  // Download all images into browser cache
  async downloadAssets(scenes, onProgress) {
    if (!('caches' in window)) {
      alert("Your browser doesn't support local caching.");
      return;
    }

    const cache = await caches.open(CACHE_NAME);
    let downloaded = 0;

    for (const scene of scenes) {
      try {
        const response = await fetch(scene.image);
        if (response.ok) {
          await cache.put(scene.image, response);
        } else {
          console.warn(`Asset not found (404): ${scene.image}`);
        }
        downloaded++;
        if (onProgress) onProgress(Math.floor((downloaded / scenes.length) * 100));
      } catch (error) {
        console.error(`Network error or CORS issue for: ${scene.image}`, error);
      }
    }
  },

  // Get a reliable placeholder if an image fails
  getFallbackImage(type) {
    return type === 'anime' 
      ? 'https://images.unsplash.com/photo-1578632738981-4330ce9b2763?q=80&w=1000&auto=format&fit=crop' // Generic Anime
      : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop'; // Generic Movie
  },

  // Clear all cached images
  async clearCache() {
    if (!('caches' in window)) return;
    await caches.delete(CACHE_NAME);
  }
};
