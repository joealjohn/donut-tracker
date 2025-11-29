/**
 * Donut Stats - Main JavaScript Application
 * 
 * Handles all API calls, UI interactions, pagination, and dynamic content
 * for the DonutSMP Statistics Platform.
 */

// ============================================
// Configuration
// ============================================
// API base path - works for both local dev and Vercel
const API_BASE = '/api';
const MINECRAFT_HEAD_API = 'https://mc-heads.net/avatar';
const MINECRAFT_ITEMS_API = 'https://minecraft-api.vercel.app/images/items';
const ITEMS_PER_PAGE = 45;
const ITEMS_PER_PAGE_OFFSET = 44; // API has 1 item overlap between pages

// Auto-refresh settings
let autoRefreshInterval = null;
let autoRefreshEnabled = false;
const AUTO_REFRESH_DELAY = 30000; // 30 seconds

// Player cache for autocomplete
let playerCache = [];
let playerCacheLoaded = false;

// ============================================
// Theme Management (Dark/Light Mode)
// ============================================

/**
 * Initialize theme based on localStorage or system preference
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark'); // Default to dark
    }
    
    updateThemeToggleIcon();
}

/**
 * Toggle between dark and light themes
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleIcon();
}

/**
 * Update the theme toggle button icon
 */
function updateThemeToggleIcon() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;
    
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const icon = toggleBtn.querySelector('i');
    if (icon) {
        icon.className = currentTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
    }
}

// ============================================
// Animated Number Counters
// ============================================

/**
 * Animate a number from 0 to target value
 */
function animateNumber(element, targetValue, duration = 1500, prefix = '', suffix = '') {
    if (!element) return;
    
    // Parse target value
    let target = targetValue;
    if (typeof targetValue === 'string') {
        // Handle abbreviated numbers like 1.5K, 2.3M, etc.
        const match = targetValue.match(/^([\d,.]+)([KMBT])?$/i);
        if (match) {
            target = parseFloat(match[1].replace(/,/g, ''));
            const multipliers = { 'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12 };
            if (match[2]) {
                target *= multipliers[match[2].toUpperCase()] || 1;
            }
        } else {
            target = parseFloat(targetValue.replace(/[^0-9.-]/g, '')) || 0;
        }
    }
    
    const startTime = performance.now();
    const startValue = 0;
    
    function formatAnimatedValue(value) {
        if (value >= 1e12) return (value / 1e12).toFixed(1) + 'T';
        if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
        return Math.floor(value).toLocaleString();
    }
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out cubic)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (target - startValue) * easeOut;
        
        element.textContent = prefix + formatAnimatedValue(currentValue) + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Set final value
            element.textContent = prefix + formatAnimatedValue(target) + suffix;
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Observe elements and animate when they come into view
 */
function initAnimatedCounters() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.animated) {
                entry.target.dataset.animated = 'true';
                const targetValue = entry.target.dataset.target || entry.target.textContent;
                const prefix = entry.target.dataset.prefix || '';
                const suffix = entry.target.dataset.suffix || '';
                animateNumber(entry.target, targetValue, 1500, prefix, suffix);
            }
        });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('.animate-count').forEach(el => observer.observe(el));
}

// ============================================
// Player Search Autocomplete
// ============================================

/**
 * Load player names from leaderboard for autocomplete
 */
async function loadPlayerCache() {
    if (playerCacheLoaded) return;
    
    try {
        // Fetch top players from money leaderboard (they're the most searched)
        const response = await fetch(`${API_BASE}/leaderboard?type=money&page=1`);
        const data = await response.json();
        
        if (data && data.result) {
            playerCache = data.result.map(p => p.username).filter(Boolean);
            playerCacheLoaded = true;
        }
    } catch (error) {
        console.error('Failed to load player cache:', error);
    }
}

/**
 * Initialize autocomplete on search inputs
 */
function initAutocomplete(inputElement) {
    if (!inputElement) return;
    
    // Create autocomplete dropdown
    let dropdown = inputElement.parentElement.querySelector('.autocomplete-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        inputElement.parentElement.style.position = 'relative';
        inputElement.parentElement.appendChild(dropdown);
    }
    
    // Load player cache
    loadPlayerCache();
    
    // Input handler
    inputElement.addEventListener('input', debounce(() => {
        const query = inputElement.value.trim().toLowerCase();
        
        if (query.length < 2) {
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
            return;
        }
        
        const matches = playerCache
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 8);
        
        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(name => `
                <div class="autocomplete-item" data-username="${name}">
                    <img src="${getPlayerHead(name, 24)}" alt="${name}" onerror="this.style.display='none'">
                    <span>${name}</span>
                </div>
            `).join('');
            dropdown.style.display = 'block';
            
            // Add click handlers
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    inputElement.value = item.dataset.username;
                    dropdown.style.display = 'none';
                    // Submit the form
                    const form = inputElement.closest('form');
                    if (form) form.submit();
                });
            });
        } else {
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
        }
    }, 200));
    
    // Hide dropdown on blur
    inputElement.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    });
    
    // Keyboard navigation
    inputElement.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        const activeItem = dropdown.querySelector('.autocomplete-item.active');
        let currentIndex = Array.from(items).indexOf(activeItem);
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeItem) activeItem.classList.remove('active');
            currentIndex = (currentIndex + 1) % items.length;
            items[currentIndex]?.classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeItem) activeItem.classList.remove('active');
            currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
            items[currentIndex]?.classList.add('active');
        } else if (e.key === 'Enter' && activeItem) {
            e.preventDefault();
            inputElement.value = activeItem.dataset.username;
            dropdown.style.display = 'none';
            const form = inputElement.closest('form');
            if (form) form.submit();
        }
    });
}

// ============================================
// Auto-Refresh Feature
// ============================================

/**
 * Toggle auto-refresh for auction page
 */
function toggleAutoRefresh() {
    const toggleBtn = document.getElementById('auto-refresh-toggle');
    
    if (autoRefreshEnabled) {
        // Disable auto-refresh
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        autoRefreshEnabled = false;
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Auto-Refresh: Off';
        }
    } else {
        // Enable auto-refresh
        autoRefreshEnabled = true;
        if (toggleBtn) {
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<i class="bi bi-arrow-repeat spinning"></i> Auto-Refresh: On';
        }
        
        // Start the refresh interval
        autoRefreshInterval = setInterval(() => {
            refreshCurrentPage();
        }, AUTO_REFRESH_DELAY);
    }
}

/**
 * Refresh the current page data without full reload
 */
function refreshCurrentPage() {
    const page = document.body.dataset.page;
    
    if (page === 'auction') {
        // Re-initialize auction without showing loading
        const container = document.getElementById('auction-container');
        if (container && !container.querySelector('.loading-screen')) {
            // Trigger a soft refresh
            const event = new CustomEvent('softRefresh');
            document.dispatchEvent(event);
        }
    }
}

// ============================================
// Price History & Sparklines
// ============================================

/**
 * Store price data in localStorage for historical tracking
 */
function storePriceHistory(itemId, price) {
    const key = `price_history_${itemId}`;
    const now = Date.now();
    
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    
    // Add new price point
    history.push({ time: now, price: price });
    
    // Keep only last 30 days of data (or 100 points max)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    history = history.filter(p => p.time > thirtyDaysAgo).slice(-100);
    
    localStorage.setItem(key, JSON.stringify(history));
}

/**
 * Get price history for an item
 */
function getPriceHistory(itemId) {
    const key = `price_history_${itemId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
}

/**
 * Generate SVG sparkline from data points
 */
function generateSparkline(data, width = 60, height = 20) {
    if (!data || data.length < 2) {
        return '<span class="sparkline-neutral">-</span>';
    }
    
    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    // Calculate points for SVG polyline
    const points = prices.map((price, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((price - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');
    
    // Determine trend
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const trendClass = lastPrice > firstPrice ? 'sparkline-up' : lastPrice < firstPrice ? 'sparkline-down' : 'sparkline-neutral';
    const trendColor = lastPrice > firstPrice ? '#22c55e' : lastPrice < firstPrice ? '#ef4444' : '#6b7280';
    
    return `
        <span class="sparkline-container ${trendClass}">
            <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <polyline 
                    fill="none" 
                    stroke="${trendColor}" 
                    stroke-width="1.5" 
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    points="${points}"
                />
            </svg>
            <span class="trend-indicator">
                ${lastPrice > firstPrice ? '↑' : lastPrice < firstPrice ? '↓' : '→'}
            </span>
        </span>
    `;
}

/**
 * Calculate price trend percentage
 */
function calculatePriceTrend(data) {
    if (!data || data.length < 2) return null;
    
    const prices = data.map(d => d.price);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    
    if (firstPrice === 0) return null;
    
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;
    return {
        percentage: change.toFixed(1),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get Minecraft item image URL from minecraft-api.vercel.app
 * @param {string} itemId - The item ID (with or without minecraft: prefix)
 * @returns {string} The image URL
 */
function getItemImageUrl(itemId) {
    // Remove minecraft: prefix if present
    let cleanId = itemId.replace(/^minecraft:/i, '').toLowerCase();
    // Use minecraft-api.vercel.app for item images
    return `${MINECRAFT_ITEMS_API}/${cleanId}.png`;
}

/**
 * Format large numbers with commas (for kills/deaths)
 */
function formatNumber(num) {
    if (typeof num === 'string') {
        num = parseFloat(num.replace(/,/g, ''));
    }
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US');
}

/**
 * Format large numbers with abbreviations (3B, 5M, 100K)
 */
function formatAbbreviated(num) {
    if (typeof num === 'string') {
        num = parseFloat(num.replace(/,/g, ''));
    }
    if (isNaN(num)) return '0';
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 1e12) {
        return sign + (absNum / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    }
    if (absNum >= 1e9) {
        return sign + (absNum / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (absNum >= 1e6) {
        return sign + (absNum / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (absNum >= 1e3) {
        return sign + (absNum / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return sign + absNum.toString();
}

/**
 * Format playtime - API returns milliseconds, convert to readable format
 */
function formatPlaytime(value) {
    if (!value || value === '0' || value === 0) return '0m';
    
    // Convert to number if string
    const ms = typeof value === 'string' ? parseInt(value, 10) : value;
    if (isNaN(ms) || ms <= 0) return '0m';
    
    // Convert milliseconds to time units
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        const remainingHours = hours % 24;
        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    } else if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Format money values with abbreviations
 */
function formatMoney(value) {
    if (typeof value === 'string') {
        // Already formatted with $ sign
        if (value.startsWith('$')) {
            value = parseFloat(value.replace(/[$,]/g, ''));
        } else {
            value = parseFloat(value.replace(/,/g, ''));
        }
    }
    if (isNaN(value)) return '$0';
    return '$' + formatAbbreviated(value);
}

/**
 * Format time remaining for auctions (API returns milliseconds)
 */
function formatTimeLeft(ms) {
    if (!ms || ms <= 0) return 'Expired';
    
    // Convert milliseconds to seconds
    const totalSeconds = Math.floor(ms / 1000);
    
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return 'Less than 1m';
}

/**
 * Debounce function for search inputs
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Get Minecraft player head URL
 */
function getPlayerHead(username, size = 36) {
    return `${MINECRAFT_HEAD_API}/${username}/${size}`;
}

/**
 * Create loading spinner HTML - Enhanced version with Minecraft theme
 */
function createLoadingSpinner(text = 'Loading...', type = 'default') {
    const tips = [
        'Fetching data from the server...',
        'Mining through the database...',
        'Crafting your statistics...',
        'Loading player information...',
        'Gathering leaderboard data...',
        'Calculating rankings...'
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    return `
        <div class="loading-screen">
            <div class="loading-content">
                <div class="loading-icon-wrapper">
                    <div class="loading-blocks">
                        <div class="loading-block block-1"></div>
                        <div class="loading-block block-2"></div>
                        <div class="loading-block block-3"></div>
                        <div class="loading-block block-4"></div>
                    </div>
                    <div class="loading-ring"></div>
                </div>
                <div class="loading-text-wrapper">
                    <h3 class="loading-title">${text}</h3>
                    <p class="loading-subtitle">${randomTip}</p>
                </div>
                <div class="loading-progress">
                    <div class="loading-progress-bar"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create error state HTML
 */
function createErrorState(message, showRetry = true) {
    return `
        <div class="error-state">
            <div class="icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
            <h3>Something went wrong</h3>
            <p>${message}</p>
            ${showRetry ? '<button class="btn btn-primary mt-2" onclick="location.reload()"><i class="bi bi-arrow-clockwise"></i> Try Again</button>' : ''}
        </div>
    `;
}

/**
 * Create empty state HTML
 */
function createEmptyState(message) {
    return `
        <div class="empty-state">
            <div class="icon"><i class="bi bi-inbox"></i></div>
            <h3>No Results Found</h3>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#4ade80' : '#3b82f6'};
        color: white;
        border-radius: 10px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// API Functions
// ============================================

/**
 * Make API request with error handling
 */
async function apiRequest(endpoint, params = {}) {
    // Build URL - handle both absolute and relative paths
    let urlString = `${API_BASE}/${endpoint}`;
    
    // Add query parameters
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== '') {
            queryParams.append(key, params[key]);
        }
    });
    
    if (queryParams.toString()) {
        urlString += '?' + queryParams.toString();
    }
    
    try {
        const response = await fetch(urlString);
        const text = await response.text();
        
        // Check if response is empty
        if (!text || text.trim() === '') {
            throw new Error('Empty response from server. Make sure Apache is running.');
        }
        
        // Check if response is valid JSON
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('Parse error, raw response:', text.substring(0, 500));
            // Check if PHP returned an error page or raw PHP
            if (text.includes('<?php') || text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<br')) {
                throw new Error('PHP error or not configured. Check Apache error logs.');
            }
            throw new Error('Invalid server response: ' + text.substring(0, 100));
        }
        
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        
        if (response.status === 401) {
            throw new Error('API key is invalid. Get a new key with /api in-game.');
        }
        
        if (!response.ok && data.message) {
            throw new Error(data.message);
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * Fetch player stats
 */
async function fetchPlayerStats(username) {
    return apiRequest('stats', { user: username });
}

/**
 * Fetch player lookup info
 */
async function fetchPlayerLookup(username) {
    return apiRequest('lookup', { user: username });
}

/**
 * Fetch leaderboard data
 */
async function fetchLeaderboard(type, page = 1) {
    return apiRequest('leaderboard', { type, page });
}

/**
 * Fetch auction listings
 */
async function fetchAuction(page = 1, search = '', sort = '') {
    return apiRequest('auction', { page, search, sort });
}

/**
 * Fetch auction transactions
 */
async function fetchTransactions(page = 1) {
    return apiRequest('transactions', { page });
}

// ============================================
// UI Components
// ============================================

/**
 * Render player profile card - Player Finder style like donutstats.net
 */
function renderPlayerProfile(lookupData, username, statsData = null) {
    const result = lookupData.result || {};
    const stats = statsData?.result || {};
    const rank = result.rank || 'default';
    // Player is online if lookup returned valid data (lookup only works for online players)
    const isOnline = !!(result.username || result.location);
    const location = result.location || '';
    const playtime = stats.playtime || '0';
    const money = stats.money || 0;
    const kills = stats.kills || 0;
    const blocks = stats.placed_blocks || 0;
    
    const statusText = isOnline ? (location ? `Online (${location})` : 'Online') : 'Offline';
    
    return `
        <div class="player-finder-card">
            <div class="player-finder-header">
                <div class="player-finder-avatar">
                    <img src="${getPlayerHead(username, 64)}" alt="${username}'s avatar" onerror="this.src='assets/images/default-avatar.svg'">
                    <span class="online-indicator ${isOnline ? 'online' : 'offline'}"></span>
                </div>
                <div class="player-finder-info">
                    <div class="player-finder-name-row">
                        <h2 class="player-finder-name">${result.username || username}</h2>
                        <span class="badge badge-status ${isOnline ? '' : 'offline'}">
                            <i class="bi bi-circle-fill"></i> ${statusText}
                        </span>
                        <span class="badge badge-rank">${rank}</span>
                    </div>
                    <p class="player-finder-playtime"><i class="bi bi-clock"></i> ${formatPlaytime(playtime)} played</p>
                </div>
            </div>
            <div class="player-finder-stats">
                <div class="player-finder-stat">
                    <i class="bi bi-coin"></i>
                    <div class="stat-data">
                        <span class="stat-num">${formatMoney(money)}</span>
                        <span class="stat-name">Money</span>
                    </div>
                </div>
                <div class="player-finder-stat">
                    <i class="bi bi-crosshair2"></i>
                    <div class="stat-data">
                        <span class="stat-num">${formatNumber(kills)}</span>
                        <span class="stat-name">Kills</span>
                    </div>
                </div>
                <div class="player-finder-stat">
                    <i class="bi bi-bricks"></i>
                    <div class="stat-data">
                        <span class="stat-num">${formatNumber(blocks)}</span>
                        <span class="stat-name">Blocks</span>
                    </div>
                </div>
                <div class="player-finder-stat">
                    <i class="bi bi-clock-history"></i>
                    <div class="stat-data">
                        <span class="stat-num">${formatPlaytime(playtime)}</span>
                        <span class="stat-name">Playtime</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render stats grid - Layout matching donutstats.net
 */
function renderStatsGrid(stats) {
    const result = stats.result || {};
    
    // Calculate K/D ratio
    const kills = parseInt(result.kills) || 0;
    const deaths = parseInt(result.deaths) || 1;
    const kdRatio = (kills / deaths).toFixed(2);
    
    // Primary stats (4 columns)
    const primaryStats = [
        { icon: 'bi-coin', label: 'Money', value: formatMoney(result.money || 0), color: 'yellow' },
        { icon: 'bi-clock', label: 'Playtime', value: formatPlaytime(result.playtime || '0'), color: 'blue' },
        { icon: 'bi-crosshair2', label: 'Kills', value: formatNumber(result.kills || 0), color: 'red', sub: null },
        { icon: 'bi-x-octagon', label: 'Deaths', value: formatNumber(result.deaths || 0), color: 'gray', sub: `K/D: ${kdRatio}` }
    ];
    
    // Secondary stats (3 columns)
    const secondaryStats = [
        { icon: 'bi-bricks', label: 'Blocks Placed', value: formatAbbreviated(result.placed_blocks || 0), color: 'green' },
        { icon: 'bi-hammer', label: 'Blocks Broken', value: formatAbbreviated(result.broken_blocks || 0), color: 'orange' },
        { icon: 'bi-controller', label: 'Mobs Killed', value: formatAbbreviated(result.mobs_killed || 0), color: 'purple' }
    ];
    
    return `
        <div class="stats-grid">
            ${primaryStats.map(stat => `
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-label">${stat.label}</span>
                        <div class="stat-icon"><i class="bi ${stat.icon}"></i></div>
                    </div>
                    <div class="stat-value">${stat.value}</div>
                    ${stat.sub ? `<div class="stat-sub">${stat.sub}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div class="stats-grid-secondary">
            ${secondaryStats.map(stat => `
                <div class="stat-card">
                    <div class="stat-card-header">
                        <span class="stat-label">${stat.label}</span>
                        <div class="stat-icon"><i class="bi ${stat.icon}"></i></div>
                    </div>
                    <div class="stat-value">${stat.value}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Format leaderboard value based on type
 */
function formatLeaderboardValue(value, type) {
    switch (type) {
        case 'money':
        case 'sell':
        case 'shop':
            return formatMoney(value);
        case 'playtime':
            return formatPlaytime(value);
        case 'shards':
        case 'kills':
        case 'deaths':
        case 'placedblocks':
        case 'brokenblocks':
        case 'mobskilled':
            return formatAbbreviated(value);
        default:
            return formatNumber(value);
    }
}

/**
 * Render leaderboard as cards
 */
function renderLeaderboardTable(data, type, page = 1) {
    let result = data.result || [];
    
    if (result.length === 0) {
        return createEmptyState('No leaderboard data available for this category.');
    }
    
    // API has 1 item overlap between pages - skip first item on pages > 1
    if (page > 1 && result.length > 0) {
        result = result.slice(1);
    }
    
    // Calculate start rank (page 1 starts at 1, page 2 starts at 46, etc.)
    const startRank = page === 1 ? 1 : (page - 1) * ITEMS_PER_PAGE + 1;
    
    const typeLabels = {
        money: 'Balance',
        kills: 'Kills',
        deaths: 'Deaths',
        playtime: 'Playtime',
        shards: 'Shards',
        brokenblocks: 'Blocks Broken',
        placedblocks: 'Blocks Placed',
        mobskilled: 'Mobs Killed',
        sell: 'Sell Earnings',
        shop: 'Shop Spent'
    };
    
    // Color classes for values
    const valueColors = {
        money: 'value-gold',
        playtime: 'value-green',
        kills: 'value-red',
        deaths: 'value-gray'
    };
    
    // Get rank class based on rank number
    const getRankClass = (rank) => {
        if (rank === 1) return 'rank-1';
        if (rank === 2) return 'rank-2';
        if (rank === 3) return 'rank-3';
        return 'rank-other';
    };
    
    return `
        <div class="leaderboard-cards">
            ${result.map((player, index) => {
                const rank = startRank + index;
                const rankClass = getRankClass(rank);
                const valueClass = valueColors[type] || '';
                return `
                    <div class="leaderboard-card">
                        <div class="leaderboard-card-rank ${rankClass}">${rank}</div>
                        <div class="leaderboard-card-player">
                            <img src="${getPlayerHead(player.username)}" alt="${player.username}" class="leaderboard-card-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/40'">
                            <span class="leaderboard-card-name">
                                <a href="stats.html?user=${encodeURIComponent(player.username)}">${player.username}</a>
                            </span>
                        </div>
                        <span class="leaderboard-card-value ${valueClass}">
                            ${formatLeaderboardValue(player.value, type)}
                        </span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * Render auction item card - Modern design matching donutstats.net
 */
function renderAuctionItem(item) {
    const displayName = item.item?.display_name || item.item?.id || 'Unknown Item';
    const count = item.item?.count || 1;
    const price = item.price || 0;
    const seller = item.seller?.name || 'Unknown';
    const sellerUuid = item.seller?.uuid || '';
    const timeLeft = item.time_left;
    const enchants = item.item?.enchants?.enchantments?.levels || {};
    const itemId = item.item?.id || '';
    const lore = item.item?.lore || [];
    const contents = item.item?.contents || null; // Shulker box contents
    
    // Format item name nicely - remove minecraft: prefix and format
    const formattedName = formatItemName(displayName, itemId);
    
    // Get item image URL
    const itemImageUrl = getItemImageUrl(itemId);
    
    // Count enchants for badge
    const enchantCount = Object.keys(enchants).length;
    
    // Check if it's a shulker box with contents
    const hasContents = contents && contents.length > 0;
    const contentsCount = hasContents ? contents.length : 0;
    
    // Store item data for modal
    const itemDataId = `auction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    window.auctionItems = window.auctionItems || {};
    window.auctionItems[itemDataId] = {
        name: formattedName,
        count,
        price,
        seller,
        sellerUuid,
        timeLeft,
        enchants,
        itemId,
        lore,
        displayName,
        imageUrl: itemImageUrl,
        contents // Store contents for modal
    };
    
    return `
        <div class="auction-card">
            <div class="auction-card-header">
                <div class="auction-item-icon">
                    <img src="${itemImageUrl}" alt="${formattedName}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'bi bi-box-seam\\'></i>';">
                </div>
                <div class="auction-card-title">
                    <h3 class="item-name">${formattedName}${count > 1 ? `<span class="item-count">x${count}</span>` : ''}</h3>
                    <div class="seller-info">
                        <img class="seller-avatar-small" src="${getPlayerHead(seller, 20)}" alt="${seller}" onerror="this.style.display='none'">
                        <span class="seller-name">by ${seller}</span>
                    </div>
                </div>
            </div>
            
            <div class="auction-badges">
                ${enchantCount > 0 ? `
                    <div class="auction-badge enchant-badge">
                        <i class="bi bi-stars"></i> ${enchantCount} Enchant${enchantCount > 1 ? 's' : ''}
                    </div>
                ` : ''}
                ${hasContents ? `
                    <div class="auction-badge contents-badge">
                        <i class="bi bi-box2"></i> ${contentsCount} Item${contentsCount > 1 ? 's' : ''} Inside
                    </div>
                ` : ''}
            </div>
            
            <div class="auction-card-stats">
                <div class="stat-box price-box">
                    <span class="stat-value">$${formatAbbreviated(price)}</span>
                    <span class="stat-label">Price</span>
                </div>
                <div class="stat-box time-box">
                    <span class="stat-value">${formatTimeLeft(timeLeft)}</span>
                    <span class="stat-label"><i class="bi bi-clock"></i> Time Left</span>
                </div>
            </div>
            
            <button class="view-details-btn" onclick="showAuctionModal('${itemDataId}')">
                <i class="bi bi-eye"></i> View Details
            </button>
        </div>
    `;
}

/**
 * Format Minecraft item name nicely
 */
function formatItemName(displayName, itemId) {
    let name = displayName || itemId || 'Unknown Item';
    
    // Remove minecraft: prefix
    name = name.replace(/^minecraft:/i, '');
    
    // Replace underscores with spaces
    name = name.replace(/_/g, ' ');
    
    // Capitalize each word properly
    name = name.split(' ').map(word => {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
    
    // Clean up extra spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    return name;
}

/**
 * Show auction item details modal
 */
function showAuctionModal(itemDataId) {
    const item = window.auctionItems?.[itemDataId];
    if (!item) return;
    
    // Get item image URL
    const itemImageUrl = getItemImageUrl(item.itemId);
    
    // Build enchantment list
    let enchantsHtml = '';
    if (Object.keys(item.enchants).length > 0) {
        enchantsHtml = `
            <div class="modal-section">
                <h4><i class="bi bi-stars"></i> Enchantments</h4>
                <div class="enchant-tags">
                    ${Object.entries(item.enchants).map(([enchant, level]) => {
                        const enchantName = enchant.replace(/^minecraft:/i, '').replace(/_/g, ' ').split(' ').map(w => 
                            w.charAt(0).toUpperCase() + w.slice(1)
                        ).join(' ');
                        const isProtection = enchant.toLowerCase().includes('protection');
                        return `<span class="enchant-tag ${isProtection ? 'protection' : ''}">
                            <i class="bi bi-${isProtection ? 'shield-check' : 'stars'}"></i> 
                            ${enchantName} ${level}
                        </span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Build lore section
    let loreHtml = '';
    if (item.lore && item.lore.length > 0) {
        loreHtml = `
            <div class="modal-section">
                <h4><i class="bi bi-card-text"></i> Lore</h4>
                <div class="item-lore">
                    ${item.lore.map(line => `<p>${line}</p>`).join('')}
                </div>
            </div>
        `;
    }
    
    // Build shulker box contents section
    let contentsHtml = '';
    if (item.contents && item.contents.length > 0) {
        contentsHtml = `
            <div class="modal-section">
                <h4><i class="bi bi-box2"></i> Shulker Box Contents (${item.contents.length} items)</h4>
                <div class="shulker-contents-grid">
                    ${item.contents.map(contentItem => {
                        const contentName = formatItemName(contentItem.display_name, contentItem.id);
                        const contentImageUrl = getItemImageUrl(contentItem.id);
                        const contentEnchants = contentItem.enchants?.enchantments?.levels || {};
                        const contentEnchantCount = Object.keys(contentEnchants).length;
                        const itemCount = contentItem.count || 1;
                        
                        return `
                            <div class="shulker-content-item" title="${contentName}${itemCount > 1 ? ' x' + itemCount : ''}${contentEnchantCount > 0 ? ' (Enchanted)' : ''}">
                                <div class="shulker-item-icon">
                                    <img src="${contentImageUrl}" alt="${contentName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <div class="shulker-item-fallback" style="display:none;">
                                        <i class="bi bi-box-seam"></i>
                                    </div>
                                    ${contentEnchantCount > 0 ? `<span class="shulker-item-enchanted"><i class="bi bi-stars"></i></span>` : ''}
                                </div>
                                <div class="shulker-item-info">
                                    <span class="shulker-item-name">${contentName}</span>
                                    ${itemCount > 1 ? `<span class="shulker-item-qty">x${itemCount}</span>` : ''}
                                </div>
                                ${contentEnchantCount > 0 ? `
                                    <div class="shulker-item-enchants">
                                        ${Object.entries(contentEnchants).slice(0, 2).map(([e, l]) => {
                                            const eName = e.replace(/^minecraft:/i, '').replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                            return `<span class="mini-enchant">${eName} ${l}</span>`;
                                        }).join('')}
                                        ${Object.keys(contentEnchants).length > 2 ? `<span class="mini-enchant more">+${Object.keys(contentEnchants).length - 2}</span>` : ''}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeAuctionModal(event)">
            <div class="modal-content ${item.contents && item.contents.length > 0 ? 'modal-wide' : ''}" onclick="event.stopPropagation()">
                <button class="modal-close" onclick="closeAuctionModal()">
                    <i class="bi bi-x-lg"></i>
                </button>
                
                <div class="modal-header-with-item">
                    <div class="modal-item-image">
                        <img src="${itemImageUrl}" alt="${item.name}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<i class=\\'bi bi-box-seam\\'></i>';">
                        ${item.count > 1 ? `<span class="modal-item-qty">x${item.count}</span>` : ''}
                    </div>
                    <div class="modal-title-info">
                        <h2 class="modal-item-name">${item.name}</h2>
                        <p class="modal-item-id">${item.itemId}</p>
                        <div class="modal-seller-row">
                            <img class="modal-seller-avatar-small" src="${getPlayerHead(item.seller, 24)}" alt="${item.seller}" onerror="this.style.display='none'">
                            <span>Listed by <a href="stats.html?user=${item.seller}">${item.seller}</a></span>
                        </div>
                    </div>
                </div>
                
                <div class="modal-stats">
                    <div class="modal-stat">
                        <span class="modal-stat-label">Quantity</span>
                        <span class="modal-stat-value">${item.count}</span>
                    </div>
                    <div class="modal-stat">
                        <span class="modal-stat-label">Price</span>
                        <span class="modal-stat-value price">$${formatAbbreviated(item.price)}</span>
                    </div>
                    <div class="modal-stat">
                        <span class="modal-stat-label">Time Left</span>
                        <span class="modal-stat-value time">${formatTimeLeft(item.timeLeft)}</span>
                    </div>
                </div>
                
                ${enchantsHtml}
                ${loreHtml}
                ${contentsHtml}
                
                <div class="modal-actions">
                    <a href="stats.html?user=${item.seller}" class="btn btn-primary">
                        <i class="bi bi-person"></i> View Seller Profile
                    </a>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

/**
 * Close auction modal
 */
function closeAuctionModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuctionModal();
});

/**
 * Get item icon based on Minecraft item ID
 */
function getItemIcon(itemId) {
    // Map common items to Bootstrap icons with fallback to emojis
    const iconMap = {
        'diamond': '<i class="bi bi-gem"></i>',
        'diamond_sword': '<i class="bi bi-slash-lg"></i>',
        'diamond_pickaxe': '<i class="bi bi-tools"></i>',
        'diamond_axe': '<i class="bi bi-tools"></i>',
        'diamond_helmet': '<i class="bi bi-shield-fill"></i>',
        'diamond_chestplate': '<i class="bi bi-shield-shaded"></i>',
        'netherite': '<i class="bi bi-square-fill"></i>',
        'iron': '<i class="bi bi-hexagon-fill"></i>',
        'gold': '<i class="bi bi-star-fill"></i>',
        'emerald': '<i class="bi bi-gem"></i>',
        'enchanted_book': '<i class="bi bi-book-fill"></i>',
        'book': '<i class="bi bi-journal"></i>',
        'potion': '<i class="bi bi-droplet-fill"></i>',
        'bow': '<i class="bi bi-arrow-up-right"></i>',
        'arrow': '<i class="bi bi-arrow-right"></i>',
        'elytra': '<i class="bi bi-wind"></i>',
        'trident': '<i class="bi bi-lightning-fill"></i>',
        'totem': '<i class="bi bi-shield-check"></i>',
        'shulker': '<i class="bi bi-box-fill"></i>',
        'beacon': '<i class="bi bi-broadcast"></i>',
        'spawner': '<i class="bi bi-cpu-fill"></i>',
        'default': '<i class="bi bi-box"></i>'
    };
    
    if (!itemId) return iconMap.default;
    
    const lowerItemId = itemId.toLowerCase();
    
    for (const [key, icon] of Object.entries(iconMap)) {
        if (lowerItemId.includes(key)) {
            return icon;
        }
    }
    
    return iconMap.default;
}

/**
 * Render auction grid
 */
function renderAuctionGrid(data) {
    const result = data.result || [];
    
    if (result.length === 0) {
        return createEmptyState('No auction listings found. Try adjusting your search criteria.');
    }
    
    return `
        <div class="auction-grid">
            ${result.map(item => renderAuctionItem(item)).join('')}
        </div>
    `;
}

/**
 * Render transaction item
 */
function renderTransactionItem(transaction) {
    const seller = transaction.seller?.name || 'Unknown';
    const price = transaction.price || 0;
    const itemId = transaction.item?.id || '';
    const displayName = transaction.item?.display_name || '';
    const count = transaction.item?.count || 1;
    const dateSold = transaction.unixMillisDateSold;
    
    // Format item name
    const formattedName = formatItemName(displayName, itemId);
    
    // Format time ago
    const timeAgo = formatTimeAgo(dateSold);
    
    return `
        <div class="transaction-item">
            <div class="transaction-item-info">
                <img class="transaction-seller-avatar" src="${getPlayerHead(seller, 32)}" alt="${seller}" onerror="this.src='assets/images/default-avatar.svg'">
                <div class="transaction-details">
                    <span class="transaction-item-name">${formattedName}${count > 1 ? ` x${count}` : ''}</span>
                    <span class="transaction-seller">Sold by <a href="stats.html?user=${encodeURIComponent(seller)}">${seller}</a></span>
                </div>
            </div>
            <div class="transaction-meta">
                <span class="transaction-price">${formatMoney(price)}</span>
                <span class="transaction-time">${timeAgo}</span>
            </div>
        </div>
    `;
}

/**
 * Format time ago
 */
function formatTimeAgo(unixMillis) {
    if (!unixMillis) return 'Unknown';
    
    const now = Date.now();
    const diff = now - unixMillis;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

/**
 * Render transactions list
 */
function renderTransactionsList(data) {
    const result = data.result || [];
    
    if (result.length === 0) {
        return createEmptyState('No transactions found.');
    }
    
    return `
        <div class="transactions-list">
            ${result.map(transaction => renderTransactionItem(transaction)).join('')}
        </div>
    `;
}

/**
 * Render pagination
 */
function renderPagination(currentPage, totalItems, onPageChange) {
    // Consider there might be more pages if we got a decent number of items
    // Different APIs return different amounts (leaderboard: 45, auction: 44, etc.)
    const hasMore = totalItems >= 20;
    
    return `
        <div class="pagination">
            <button class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
                ◀
            </button>
            <span class="pagination-info">Page ${currentPage}</span>
            <button class="pagination-btn" ${!hasMore ? 'disabled' : ''} data-page="${currentPage + 1}">
                ▶
            </button>
        </div>
    `;
}

// ============================================
// Page Controllers
// ============================================

/**
 * Initialize stats page - donutstats.net style
 */
async function initStatsPage() {
    const profileContainer = document.getElementById('player-profile-container');
    const searchPlaceholder = document.getElementById('search-placeholder');
    const searchForm = document.getElementById('player-search-form');
    const searchInput = document.getElementById('player-search');
    
    // Get username from URL
    const params = new URLSearchParams(window.location.search);
    const username = params.get('user');
    
    // Form submission handler
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = searchInput?.value.trim();
            if (user) {
                window.location.href = `stats.html?user=${encodeURIComponent(user)}`;
            }
        });
    }
    
    if (!username) {
        // Show search placeholder, hide profile
        if (searchPlaceholder) searchPlaceholder.style.display = 'block';
        if (profileContainer) profileContainer.style.display = 'none';
        return;
    }
    
    // Hide search placeholder, show profile container
    if (searchPlaceholder) searchPlaceholder.style.display = 'none';
    if (profileContainer) profileContainer.style.display = 'block';
    
    // Update search input
    if (searchInput) searchInput.value = username;
    
    // Show loading states
    const playerInfoSection = document.getElementById('player-info-section');
    const playerStatsGrid = document.getElementById('player-stats-grid');
    const rankingsGrid = document.getElementById('rankings-grid');
    
    if (playerInfoSection) playerInfoSection.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    if (playerStatsGrid) playerStatsGrid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    if (rankingsGrid) rankingsGrid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    
    try {
        // Fetch player UUID from Mojang API (via proxy to avoid CORS)
        let playerUUID = null;
        try {
            const uuidResponse = await fetch(`${API_BASE}/mojang?username=${encodeURIComponent(username)}`);
            const uuidData = await uuidResponse.json();
            if (uuidData.id) {
                playerUUID = uuidData.id;
            }
        } catch (e) {
            console.log('Could not fetch UUID from Mojang');
        }
        
        // Initialize 3D skin viewer
        init3DSkinViewer(username, playerUUID);
        
        // Fetch lookup and stats in parallel
        const [lookupData, statsData] = await Promise.all([
            fetchPlayerLookup(username).catch(() => ({ result: {} })),
            fetchPlayerStats(username)
        ]);
        
        const result = lookupData.result || {};
        const stats = statsData.result || {};
        const isOnline = !!(result.username || result.location);
        const location = result.location || '';
        
        // Render player info section
        if (playerInfoSection) {
            playerInfoSection.innerHTML = renderPlayerInfoSection(username, result, stats, isOnline, location, playerUUID);
            
            // Add UUID copy functionality
            const uuidEl = document.getElementById('player-uuid');
            if (uuidEl) {
                uuidEl.addEventListener('click', () => {
                    navigator.clipboard.writeText(uuidEl.textContent);
                    uuidEl.title = 'Copied!';
                    setTimeout(() => uuidEl.title = 'Click to copy', 2000);
                });
            }
        }
        
        // Render stats grid
        if (playerStatsGrid) {
            playerStatsGrid.innerHTML = renderPlayerStatsCards(stats);
        }
        
        // Fetch and render leaderboard rankings
        if (rankingsGrid) {
            await renderPlayerRankings(username, rankingsGrid);
        }
        
        // Update page title
        document.title = `${username}'s Stats - Donut Stats`;
        
    } catch (error) {
        if (playerInfoSection) playerInfoSection.innerHTML = `<div class="error-state"><p>Failed to load player: ${error.message}</p></div>`;
        if (playerStatsGrid) playerStatsGrid.innerHTML = '';
        if (rankingsGrid) rankingsGrid.innerHTML = '';
    }
}

/**
 * Initialize 3D skin viewer using skinview3d
 */
function init3DSkinViewer(username, uuid) {
    const canvas = document.getElementById('skin-viewer');
    if (!canvas || typeof skinview3d === 'undefined') {
        console.log('Skinview3d not available');
        showFallbackSkin(username);
        return;
    }
    
    // Use our local proxy to avoid CORS issues
    const skinUrl = `${API_BASE}/skin?username=${encodeURIComponent(username)}`;
    
    try {
        const skinViewer = new skinview3d.SkinViewer({
            canvas: canvas,
            width: 250,
            height: 350,
            skin: skinUrl
        });
        
        // Set up the viewer
        skinViewer.fov = 70;
        skinViewer.zoom = 0.9;
        skinViewer.autoRotate = true;
        skinViewer.autoRotateSpeed = 0.5;
        
        // Start with walking animation enabled
        skinViewer.animation = new skinview3d.WalkingAnimation();
        skinViewer.animation.speed = 0.8;
        
        // Control buttons
        const rotateBtn = document.getElementById('skin-rotate-toggle');
        const walkBtn = document.getElementById('skin-walk-toggle');
        const resetBtn = document.getElementById('skin-reset');
        
        let isWalking = true; // Start with walking enabled
        
        if (rotateBtn) {
            rotateBtn.classList.add('active'); // Rotate is active by default
            rotateBtn.addEventListener('click', () => {
                skinViewer.autoRotate = !skinViewer.autoRotate;
                rotateBtn.classList.toggle('active');
            });
        }
        
        if (walkBtn) {
            walkBtn.classList.add('active'); // Walk is active by default
            walkBtn.addEventListener('click', () => {
                isWalking = !isWalking;
                if (isWalking) {
                    skinViewer.animation = new skinview3d.WalkingAnimation();
                    skinViewer.animation.speed = 0.8;
                } else {
                    skinViewer.animation = new skinview3d.IdleAnimation();
                }
                walkBtn.classList.toggle('active');
            });
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                skinViewer.resetCameraPose();
                skinViewer.zoom = 0.9;
            });
        }
        
        // Enable controls
        skinViewer.controls.enableRotate = true;
        skinViewer.controls.enableZoom = true;
        skinViewer.controls.enablePan = false;
        
    } catch (error) {
        console.error('Error initializing skin viewer:', error);
        showFallbackSkin(username);
    }
}

/**
 * Show fallback static skin image
 */
function showFallbackSkin(username) {
    const canvas = document.getElementById('skin-viewer');
    if (canvas) {
        canvas.style.display = 'none';
        const container = canvas.parentElement;
        if (container) {
            container.innerHTML = `
                <img src="https://mc-heads.net/body/${username}/250" alt="${username}" class="fallback-skin-image">
            `;
        }
    }
}

/**
 * Render player info section with new design
 */
function renderPlayerInfoSection(username, result, stats, isOnline, location, uuid) {
    const rank = result.rank || 'Member';
    const playtime = stats.playtime || 0;
    const money = stats.money || 0;
    const kills = parseInt(stats.kills) || 0;
    const deaths = parseInt(stats.deaths) || 1;
    const kdRatio = (kills / deaths).toFixed(2);
    const statusText = isOnline ? 'Online' : 'Offline';
    
    const displayUUID = uuid ? `${uuid.slice(0,8)}...${uuid.slice(-4)}` : 'Unknown';
    
    return `
        <div class="player-name-row">
            <h1 class="player-username">${result.username || username}</h1>
        </div>
        
        <div class="player-status-badges">
            <span class="status-badge ${isOnline ? 'online' : 'offline'}">
                <i class="bi bi-circle-fill"></i> ${statusText}
            </span>
            <span class="status-badge rank">
                <i class="bi bi-award"></i> ${rank}
            </span>
            ${uuid ? `<span class="player-uuid" id="player-uuid" title="Click to copy">${displayUUID}</span>` : ''}
        </div>
        
        <div class="player-quick-stats">
            <div class="quick-stat">
                <div class="quick-stat-value">${formatMoney(money)}</div>
                <div class="quick-stat-label">Balance</div>
            </div>
            <div class="quick-stat">
                <div class="quick-stat-value">${formatPlaytime(playtime)}</div>
                <div class="quick-stat-label">Playtime</div>
            </div>
            <div class="quick-stat">
                <div class="quick-stat-value">${kdRatio}</div>
                <div class="quick-stat-label">K/D Ratio</div>
            </div>
        </div>
        
        ${location ? `
            <div class="player-location">
                <i class="bi bi-geo-alt-fill"></i>
                <span>Currently at:</span>
                <strong>${location}</strong>
            </div>
        ` : ''}
    `;
}

/**
 * Render player stats cards - donutstats.net style grid
 */
function renderPlayerStatsCards(stats) {
    const kills = parseInt(stats.kills) || 0;
    const deaths = parseInt(stats.deaths) || 1;
    const kdRatio = (kills / deaths).toFixed(2);
    
    const statCards = [
        { icon: 'bi-currency-dollar', label: 'Money', value: formatMoney(stats.money || 0), color: 'gold' },
        { icon: 'bi-clock', label: 'Playtime', value: formatPlaytime(stats.playtime || 0), color: 'blue' },
        { icon: 'bi-crosshair', label: 'Kills', value: formatNumber(stats.kills || 0), sub: `K/D: ${kdRatio}`, color: 'red' },
        { icon: 'bi-heart', label: 'Deaths', value: formatNumber(stats.deaths || 0), color: 'gray' },
        { icon: 'bi-grid-3x3', label: 'Blocks Placed', value: formatAbbreviated(stats.placed_blocks || 0), color: 'green' },
        { icon: 'bi-hammer', label: 'Blocks Broken', value: formatAbbreviated(stats.broken_blocks || 0), color: 'orange' },
        { icon: 'bi-bug', label: 'Mobs Killed', value: formatAbbreviated(stats.mobs_killed || 0), color: 'purple' }
    ];
    
    return statCards.map(stat => `
        <div class="player-stat-card">
            <div class="player-stat-header">
                <span class="player-stat-label">${stat.label}</span>
                <i class="bi ${stat.icon} player-stat-icon"></i>
            </div>
            <div class="player-stat-value">${stat.value}</div>
            ${stat.sub ? `<div class="player-stat-sub">${stat.sub}</div>` : ''}
        </div>
    `).join('');
}

/**
 * Render player leaderboard rankings
 */
async function renderPlayerRankings(username, container) {
    const categories = [
        { type: 'money', label: 'Top Money Holders', icon: 'bi-currency-dollar' },
        { type: 'kills', label: 'Top PvP Players', icon: 'bi-crosshair' },
        { type: 'playtime', label: 'Top Active Players', icon: 'bi-clock' },
        { type: 'placedblocks', label: 'Top Builders', icon: 'bi-grid-3x3' }
    ];
    
    const rankings = [];
    
    // Fetch leaderboards and find player's position
    for (const cat of categories) {
        try {
            const data = await fetch(`${API_BASE}/leaderboard?type=${cat.type}&page=1`);
            const json = await data.json();
            const players = json.result || [];
            const playerIndex = players.findIndex(p => p.username.toLowerCase() === username.toLowerCase());
            
            if (playerIndex !== -1) {
                rankings.push({
                    ...cat,
                    rank: playerIndex + 1,
                    value: players[playerIndex].value
                });
            }
        } catch (e) {
            console.error(`Failed to fetch ${cat.type} leaderboard`);
        }
    }
    
    if (rankings.length === 0) {
        container.innerHTML = '<p class="no-data">No leaderboard rankings found for this player.</p>';
        return;
    }
    
    container.innerHTML = rankings.map(r => `
        <a href="leaderboards.html?type=${r.type}" class="ranking-card">
            <div class="ranking-icon"><i class="bi ${r.icon}"></i></div>
            <div class="ranking-info">
                <span class="ranking-label">${r.label}</span>
                <span class="ranking-position">Leaderboard Position <strong>#${r.rank}</strong></span>
            </div>
        </a>
    `).join('');
}

/**
 * Initialize leaderboards page - donutstats.net style
 */
async function initLeaderboardsPage() {
    const currentLeadersContainer = document.getElementById('current-leaders');
    const leaderboardsGrid = document.getElementById('leaderboards-grid');
    
    if (!currentLeadersContainer && !leaderboardsGrid) return;
    
    // Check if we're viewing a full category
    const params = new URLSearchParams(window.location.search);
    const fullType = params.get('type');
    const fullView = params.get('full') === '1';
    
    if (fullType && fullView) {
        // Show expanded leaderboard view
        await initExpandedLeaderboard(fullType);
        return;
    }
    
    // All categories with their metadata
    const categories = [
        { type: 'money', title: 'Top Money Holders', subtitle: 'Players with the most money', icon: 'bi-currency-dollar', valueLabel: 'Money' },
        { type: 'shards', title: 'Top Shard Collectors', subtitle: 'Players with the most shards', icon: 'bi-gem', valueLabel: 'Shards' },
        { type: 'kills', title: 'Top PvP Players', subtitle: 'Players with the most kills', icon: 'bi-crosshair', valueLabel: 'Kills' },
        { type: 'deaths', title: 'Top Deaths', subtitle: 'Players who died the most', icon: 'bi-heart', valueLabel: 'Deaths' },
        { type: 'playtime', title: 'Top Active Players', subtitle: 'Players with the most playtime', icon: 'bi-clock', valueLabel: 'Playtime' },
        { type: 'placedblocks', title: 'Top Builders', subtitle: 'Players who placed the most blocks', icon: 'bi-grid-3x3', valueLabel: 'Blocks' },
        { type: 'brokenblocks', title: 'Top Block Breakers', subtitle: 'Players who broke the most blocks', icon: 'bi-hammer', valueLabel: 'Broken' },
        { type: 'mobskilled', title: 'Top Mob Hunters', subtitle: 'Players who killed the most mobs', icon: 'bi-bug', valueLabel: 'Mobs' },
        { type: 'shop', title: 'Top Spenders', subtitle: 'Players who spent the most in shops', icon: 'bi-cart', valueLabel: 'Spent' },
        { type: 'sell', title: 'Top Sellers', subtitle: 'Players who earned the most from selling', icon: 'bi-currency-dollar', valueLabel: 'Earned' }
    ];
    
    // Store all leaderboard data
    const leaderboardData = {};
    
    // Fetch all leaderboards in parallel
    const fetchPromises = categories.map(async (cat) => {
        try {
            const response = await fetch(`${API_BASE}/leaderboard?type=${cat.type}&page=1`);
            const data = await response.json();
            leaderboardData[cat.type] = data.result || [];
        } catch (error) {
            console.error(`Failed to fetch ${cat.type}:`, error);
            leaderboardData[cat.type] = [];
        }
    });
    
    await Promise.all(fetchPromises);
    
    // Render Current Leaders (featured cards)
    if (currentLeadersContainer) {
        const leaderCards = categories.map(cat => {
            const players = leaderboardData[cat.type] || [];
            if (players.length === 0) return '';
            
            const leader = players[0];
            return `
                <a href="stats.html?user=${encodeURIComponent(leader.username)}" class="leader-card">
                    <div class="leader-card-icon">
                        <i class="bi ${cat.icon}"></i>
                    </div>
                    <img src="${getPlayerHead(leader.username)}" alt="${leader.username}" class="leader-card-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/64'">
                    <div class="leader-card-name">${leader.username}</div>
                    <div class="leader-card-value">${formatLeaderboardValue(leader.value, cat.type)}</div>
                    <div class="leader-card-label">${cat.title}</div>
                </a>
            `;
        }).join('');
        
        currentLeadersContainer.innerHTML = leaderCards || '<p class="no-data">No data available</p>';
    }
    
    // Render Category Leaderboards Grid (2-column layout)
    if (leaderboardsGrid) {
        const categoryCards = categories.map(cat => {
            const players = leaderboardData[cat.type] || [];
            const top5 = players.slice(0, 5);
            
            return `
                <div class="category-leaderboard-card" data-type="${cat.type}">
                    <div class="category-header">
                        <div class="category-title">
                            <i class="bi ${cat.icon}"></i>
                            <div>
                                <h3>${cat.title}</h3>
                                <span>${cat.subtitle}</span>
                            </div>
                        </div>
                        <i class="bi bi-chevron-down header-chevron"></i>
                    </div>
                    <div class="category-players">
                        ${top5.length > 0 ? top5.map((player, index) => {
                            const rank = index + 1;
                            return `
                                <a href="stats.html?user=${encodeURIComponent(player.username)}" class="player-row">
                                    <div class="player-row-rank rank-${rank}">${rank}</div>
                                    <img src="${getPlayerHead(player.username)}" alt="${player.username}" class="player-row-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/32'">
                                    <div class="player-row-info">
                                        <div class="player-row-name">${player.username}</div>
                                        <div class="player-row-subtitle">${cat.valueLabel}</div>
                                    </div>
                                    <div class="player-row-value">${formatLeaderboardValue(player.value, cat.type)}</div>
                                </a>
                            `;
                        }).join('') : '<p class="no-data">No data available</p>'}
                    </div>
                    <button class="view-all-btn" onclick="expandLeaderboard('${cat.type}')">View All 45 Players</button>
                </div>
            `;
        }).join('');
        
        leaderboardsGrid.innerHTML = categoryCards;
    }
}

/**
 * Expand a leaderboard category to show all players
 */
function expandLeaderboard(type) {
    window.location.href = `leaderboards.html?type=${type}&full=1&page=1`;
}

/**
 * Initialize expanded leaderboard view
 */
async function initExpandedLeaderboard(type) {
    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    
    // Category metadata
    const categoryMeta = {
        'money': { title: 'Money Leaderboard', subtitle: 'Players with the most in-game currency', icon: 'bi-currency-dollar', valueLabel: 'Balance', color: '#22c55e' },
        'shards': { title: 'Shards Leaderboard', subtitle: 'Top shard collectors on the server', icon: 'bi-gem', valueLabel: 'Shards', color: '#a855f7' },
        'kills': { title: 'PvP Leaderboard', subtitle: 'Most skilled fighters in combat', icon: 'bi-crosshair', valueLabel: 'Kills', color: '#ef4444' },
        'deaths': { title: 'Deaths Leaderboard', subtitle: 'Players who faced the most danger', icon: 'bi-heart', valueLabel: 'Deaths', color: '#6b7280' },
        'playtime': { title: 'Playtime Leaderboard', subtitle: 'Most dedicated server members', icon: 'bi-clock', valueLabel: 'Time Played', color: '#3b82f6' },
        'placedblocks': { title: 'Builders Leaderboard', subtitle: 'Top builders and constructors', icon: 'bi-grid-3x3', valueLabel: 'Blocks Placed', color: '#f59e0b' },
        'brokenblocks': { title: 'Mining Leaderboard', subtitle: 'Most blocks broken and mined', icon: 'bi-hammer', valueLabel: 'Blocks Broken', color: '#78716c' },
        'mobskilled': { title: 'Mob Hunter Leaderboard', subtitle: 'Top monster slayers', icon: 'bi-bug', valueLabel: 'Mobs Killed', color: '#14b8a6' },
        'shop': { title: 'Spending Leaderboard', subtitle: 'Biggest spenders in shops', icon: 'bi-cart', valueLabel: 'Spent', color: '#ec4899' },
        'sell': { title: 'Sellers Leaderboard', subtitle: 'Top earners from selling items', icon: 'bi-cash-stack', valueLabel: 'Earned', color: '#22c55e' }
    };
    
    const meta = categoryMeta[type] || { title: 'Leaderboard', subtitle: '', icon: 'bi-trophy', valueLabel: 'Value', color: '#3b82f6' };
    
    // Hide current leaders section
    const currentLeadersWrapper = document.querySelector('.current-leaders-wrapper');
    if (currentLeadersWrapper) {
        currentLeadersWrapper.style.display = 'none';
    }
    
    // Get the main container
    const leaderboardsGrid = document.getElementById('leaderboards-grid');
    if (!leaderboardsGrid) return;
    
    // Reset grid styles for expanded view
    leaderboardsGrid.style.display = 'block';
    leaderboardsGrid.style.maxWidth = '900px';
    leaderboardsGrid.style.margin = '0 auto';
    
    // Show loading
    leaderboardsGrid.innerHTML = createLoadingSpinner('Loading leaderboard...');
    
    // Fetch leaderboard data
    async function loadLeaderboard() {
        try {
            const response = await fetch(`${API_BASE}/leaderboard?type=${type}&page=${currentPage}`);
            const data = await response.json();
            const players = data.result || [];
            
            // Calculate actual rank offset
            const rankOffset = (currentPage - 1) * ITEMS_PER_PAGE_OFFSET;
            
            // Check if there's a next page
            const hasNextPage = players.length === ITEMS_PER_PAGE;
            const hasPrevPage = currentPage > 1;
            
            // Separate top 3 players (only on page 1)
            const isFirstPage = currentPage === 1;
            const topPlayers = isFirstPage ? players.slice(0, 3) : [];
            const remainingPlayers = isFirstPage ? players.slice(3) : players;
            
            leaderboardsGrid.innerHTML = `
                <div class="expanded-leaderboard-container">
                    <!-- Header Section -->
                    <div class="expanded-header">
                        <button class="expanded-back-btn" onclick="window.location.href='leaderboards.html'">
                            <i class="bi bi-arrow-left"></i>
                        </button>
                        <div class="expanded-header-content">
                            <div class="expanded-header-icon" style="background: ${meta.color}20; color: ${meta.color}">
                                <i class="bi ${meta.icon}"></i>
                            </div>
                            <div class="expanded-header-text">
                                <h1>${meta.title}</h1>
                                <p>${meta.subtitle}</p>
                            </div>
                        </div>
                        <div class="expanded-header-page">
                            <span>Page</span>
                            <strong>${currentPage}</strong>
                        </div>
                    </div>

                    ${isFirstPage && topPlayers.length >= 3 ? `
                    <!-- Podium Section (Top 3) -->
                    <div class="expanded-podium">
                        <!-- 2nd Place -->
                        <a href="stats.html?user=${encodeURIComponent(topPlayers[1].username)}" class="podium-card podium-2">
                            <div class="podium-rank">2</div>
                            <img src="${getPlayerHead(topPlayers[1].username, 64)}" alt="${topPlayers[1].username}" class="podium-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/64'">
                            <div class="podium-name">${topPlayers[1].username}</div>
                            <div class="podium-value" style="color: ${meta.color}">${formatLeaderboardValue(topPlayers[1].value, type)}</div>
                            <div class="podium-label">${meta.valueLabel}</div>
                        </a>
                        
                        <!-- 1st Place -->
                        <a href="stats.html?user=${encodeURIComponent(topPlayers[0].username)}" class="podium-card podium-1">
                            <div class="podium-crown"><i class="bi bi-trophy-fill"></i></div>
                            <div class="podium-rank">1</div>
                            <img src="${getPlayerHead(topPlayers[0].username, 80)}" alt="${topPlayers[0].username}" class="podium-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/80'">
                            <div class="podium-name">${topPlayers[0].username}</div>
                            <div class="podium-value" style="color: ${meta.color}">${formatLeaderboardValue(topPlayers[0].value, type)}</div>
                            <div class="podium-label">${meta.valueLabel}</div>
                        </a>
                        
                        <!-- 3rd Place -->
                        <a href="stats.html?user=${encodeURIComponent(topPlayers[2].username)}" class="podium-card podium-3">
                            <div class="podium-rank">3</div>
                            <img src="${getPlayerHead(topPlayers[2].username, 64)}" alt="${topPlayers[2].username}" class="podium-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/64'">
                            <div class="podium-name">${topPlayers[2].username}</div>
                            <div class="podium-value" style="color: ${meta.color}">${formatLeaderboardValue(topPlayers[2].value, type)}</div>
                            <div class="podium-label">${meta.valueLabel}</div>
                        </a>
                    </div>
                    ` : ''}

                    <!-- Rankings List -->
                    <div class="expanded-rankings-card">
                        <div class="expanded-rankings-header">
                            <span class="rankings-col-rank">Rank</span>
                            <span class="rankings-col-player">Player</span>
                            <span class="rankings-col-value">${meta.valueLabel}</span>
                        </div>
                        <div class="expanded-rankings-list">
                            ${remainingPlayers.length > 0 ? remainingPlayers.map((player, index) => {
                                const rank = isFirstPage ? index + 4 : rankOffset + index + 1;
                                const isTop10 = rank <= 10;
                                return `
                                    <a href="stats.html?user=${encodeURIComponent(player.username)}" class="expanded-rank-row ${isTop10 ? 'top-10' : ''}">
                                        <div class="rank-number ${rank <= 10 ? 'highlight' : ''}">#${rank}</div>
                                        <div class="rank-player">
                                            <img src="${getPlayerHead(player.username)}" alt="${player.username}" class="rank-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/32'">
                                            <span class="rank-name">${player.username}</span>
                                        </div>
                                        <div class="rank-value" style="color: ${meta.color}">${formatLeaderboardValue(player.value, type)}</div>
                                    </a>
                                `;
                            }).join('') : (isFirstPage && topPlayers.length > 0 ? '' : '<p class="no-data">No players found</p>')}
                        </div>
                    </div>

                    <!-- Pagination -->
                    <div class="expanded-pagination-wrapper">
                        ${generateExpandedPagination(currentPage, hasNextPage, type)}
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            leaderboardsGrid.innerHTML = createErrorState('Failed to load leaderboard data');
        }
    }
    
    await loadLeaderboard();
}

/**
 * Generate pagination HTML for expanded leaderboard view
 */
function generateExpandedPagination(currentPage, hasNextPage, type) {
    const hasPrevPage = currentPage > 1;
    const maxVisiblePages = 5;
    
    let pages = [];
    pages.push(1);
    
    let startPage = Math.max(2, currentPage - 2);
    let endPage = currentPage + 2;
    
    if (startPage > 2) {
        pages.push('...');
    }
    
    for (let i = startPage; i <= endPage; i++) {
        if (i > 1) {
            pages.push(i);
        }
    }
    
    if (hasNextPage && endPage < currentPage + 3) {
        pages.push('...');
    }
    
    return `
        <div class="expanded-pagination-inner">
            <button class="exp-page-btn exp-nav-btn" ${!hasPrevPage ? 'disabled' : ''} onclick="goToLeaderboardPage(${currentPage - 1}, '${type}')">
                <i class="bi bi-chevron-left"></i>
            </button>
            
            <div class="exp-page-numbers">
                ${pages.map(page => {
                    if (page === '...') {
                        return `<span class="exp-page-dots">...</span>`;
                    }
                    return `<button class="exp-page-btn ${page === currentPage ? 'active' : ''}" onclick="goToLeaderboardPage(${page}, '${type}')">${page}</button>`;
                }).join('')}
            </div>
            
            <button class="exp-page-btn exp-nav-btn" ${!hasNextPage ? 'disabled' : ''} onclick="goToLeaderboardPage(${currentPage + 1}, '${type}')">
                <i class="bi bi-chevron-right"></i>
            </button>
        </div>
        
        <div class="exp-page-jump">
            <span>Jump to page</span>
            <input type="number" min="1" value="${currentPage}" id="page-jump-input" onkeypress="if(event.key==='Enter')jumpToLeaderboardPage('${type}')">
            <button onclick="jumpToLeaderboardPage('${type}')">Go</button>
        </div>
    `;
}

/**
 * Generate pagination HTML for leaderboard
 */
function generateLeaderboardPagination(currentPage, hasNextPage, type) {
    const hasPrevPage = currentPage > 1;
    // Estimate max pages (we don't know exact total, so show reasonable range)
    const maxVisiblePages = 5;
    
    let pages = [];
    
    // Always show page 1
    pages.push(1);
    
    // Calculate range around current page
    let startPage = Math.max(2, currentPage - 2);
    let endPage = currentPage + 2;
    
    // Add ellipsis after page 1 if needed
    if (startPage > 2) {
        pages.push('...');
    }
    
    // Add pages around current
    for (let i = startPage; i <= endPage; i++) {
        if (i > 1) {
            pages.push(i);
        }
    }
    
    // Add ellipsis and extend if there's more
    if (hasNextPage && endPage < currentPage + 3) {
        pages.push('...');
    }
    
    // Generate HTML
    let html = `
        <button class="pagination-nav-btn" ${!hasPrevPage ? 'disabled' : ''} onclick="goToLeaderboardPage(${currentPage - 1}, '${type}')">
            <i class="bi bi-chevron-left"></i>
            <span>Previous</span>
        </button>
        
        <div class="pagination-pages">
    `;
    
    pages.forEach(page => {
        if (page === '...') {
            html += `<span class="pagination-page dots">...</span>`;
        } else {
            html += `<button class="pagination-page ${page === currentPage ? 'active' : ''}" onclick="goToLeaderboardPage(${page}, '${type}')">${page}</button>`;
        }
    });
    
    html += `
        </div>
        
        <button class="pagination-nav-btn" ${!hasNextPage ? 'disabled' : ''} onclick="goToLeaderboardPage(${currentPage + 1}, '${type}')">
            <span>Next</span>
            <i class="bi bi-chevron-right"></i>
        </button>
        
        <div class="pagination-jump">
            <span class="pagination-jump-label">Go to:</span>
            <input type="number" class="pagination-jump-input" min="1" value="${currentPage}" id="page-jump-input" onkeypress="if(event.key==='Enter')jumpToLeaderboardPage('${type}')">
            <button class="pagination-jump-btn" onclick="jumpToLeaderboardPage('${type}')">Go</button>
        </div>
    `;
    
    return html;
}

/**
 * Jump to a specific page from input
 */
function jumpToLeaderboardPage(type) {
    const input = document.getElementById('page-jump-input');
    const page = parseInt(input.value);
    if (page && page >= 1) {
        goToLeaderboardPage(page, type);
    }
}

/**
 * Navigate to a specific leaderboard page
 */
function goToLeaderboardPage(page, type) {
    window.location.href = `leaderboards.html?type=${type}&full=1&page=${page}`;
}

/**
 * Initialize auction page
 */
async function initAuctionPage() {
    const container = document.getElementById('auction-container');
    const paginationContainer = document.getElementById('pagination-container');
    const searchInput = document.getElementById('auction-search');
    const sortSelect = document.getElementById('auction-sort');
    
    if (!container) return;
    
    // Get params from URL
    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    let currentSearch = params.get('search') || '';
    let currentSort = params.get('sort') || '';
    
    // Set input values
    if (searchInput) searchInput.value = currentSearch;
    if (sortSelect) sortSelect.value = currentSort;
    
    // Load auction listings
    async function loadAuction(showLoading = true) {
        if (showLoading) {
            container.innerHTML = createLoadingSpinner('Loading auction listings...');
        }
        
        try {
            const data = await fetchAuction(currentPage, currentSearch, currentSort);
            container.innerHTML = renderAuctionGrid(data);
            
            // Render pagination
            if (paginationContainer) {
                paginationContainer.innerHTML = renderPagination(currentPage, (data.result || []).length);
                
                // Add pagination click handlers
                paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (!btn.disabled) {
                            currentPage = parseInt(btn.dataset.page);
                            updateURL();
                            loadAuction();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    });
                });
            }
        } catch (error) {
            container.innerHTML = createErrorState(error.message);
        }
    }
    
    // Update URL without reload
    function updateURL() {
        const url = new URL(window.location);
        url.searchParams.set('page', currentPage);
        if (currentSearch) url.searchParams.set('search', currentSearch);
        else url.searchParams.delete('search');
        if (currentSort) url.searchParams.set('sort', currentSort);
        else url.searchParams.delete('sort');
        window.history.pushState({}, '', url);
    }
    
    // Search handler with debounce
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            currentSearch = searchInput.value.trim();
            currentPage = 1;
            updateURL();
            loadAuction();
        }, 500));
    }
    
    // Sort handler
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentSort = sortSelect.value;
            currentPage = 1;
            updateURL();
            loadAuction();
        });
    }
    
    // Listen for soft refresh events (auto-refresh)
    document.addEventListener('softRefresh', () => {
        loadAuction(false); // Don't show loading spinner on auto-refresh
    });
    
    // Initial load
    loadAuction();
}

/**
 * Initialize transactions page
 */
async function initTransactionsPage() {
    const container = document.getElementById('transactions-container');
    const paginationContainer = document.getElementById('pagination-container');
    
    if (!container) return;
    
    // Get page from URL
    const params = new URLSearchParams(window.location.search);
    let currentPage = parseInt(params.get('page')) || 1;
    
    // Load transaction stats (approximate)
    loadTransactionStats();
    
    // Load transactions
    async function loadTransactions() {
        container.innerHTML = createLoadingSpinner('Loading transactions...');
        
        try {
            const data = await fetchTransactions(currentPage);
            container.innerHTML = renderTransactionsList(data);
            
            // Render pagination
            if (paginationContainer) {
                paginationContainer.innerHTML = renderPagination(currentPage, (data.result || []).length);
                
                // Add pagination click handlers
                paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (!btn.disabled) {
                            currentPage = parseInt(btn.dataset.page);
                            updateURL();
                            loadTransactions();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    });
                });
            }
        } catch (error) {
            container.innerHTML = createErrorState(error.message);
        }
    }
    
    // Update URL without reload
    function updateURL() {
        const url = new URL(window.location);
        url.searchParams.set('page', currentPage);
        window.history.pushState({}, '', url);
    }
    
    // Initial load
    loadTransactions();
}

/**
 * Load transaction statistics
 */
async function loadTransactionStats() {
    try {
        // Fetch first page of transactions to calculate stats
        const response = await fetch(`${API_BASE}/transactions?page=1`);
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            // Calculate totals from visible transactions
            const transactions = data.result;
            const totalVolume = transactions.reduce((sum, t) => sum + (t.price || 0), 0);
            
            // Get recent transactions (last 24 hours)
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            const recentTransactions = transactions.filter(t => {
                const timestamp = t.timestamp ? new Date(t.timestamp).getTime() : 0;
                return timestamp > oneDayAgo;
            });
            const dailyVolume = recentTransactions.reduce((sum, t) => sum + (t.price || 0), 0);
            
            // Update stats display (these are samples from current page)
            const statTotalTransactions = document.getElementById('stat-total-transactions');
            const statTotalVolume = document.getElementById('stat-total-volume');
            const statDailyTransactions = document.getElementById('stat-daily-transactions');
            const statDailyVolume = document.getElementById('stat-daily-volume');
            
            if (statTotalTransactions) statTotalTransactions.textContent = formatNumber(transactions.length * 100) + '+';
            if (statTotalVolume) statTotalVolume.textContent = formatMoney(totalVolume * 100);
            if (statDailyTransactions) statDailyTransactions.textContent = formatNumber(recentTransactions.length);
            if (statDailyVolume) statDailyVolume.textContent = formatMoney(dailyVolume);
        }
    } catch (error) {
        console.error('Failed to load transaction stats:', error);
    }
}

/**
 * Initialize server stats page (donutstats.net style)
 */
async function initServerStatsPage() {
    // Categories with their icons and labels
    const categories = [
        { type: 'money', label: 'Top Money Holders', icon: 'bi-currency-dollar', valueLabel: 'Money' },
        { type: 'shards', label: 'Top Shard Collectors', icon: 'bi-gem', valueLabel: 'Shards' },
        { type: 'kills', label: 'Top PvP Players', icon: 'bi-crosshair', valueLabel: 'Kills' },
        { type: 'deaths', label: 'Top Deaths', icon: 'bi-heart', valueLabel: 'Deaths' },
        { type: 'playtime', label: 'Top Active Players', icon: 'bi-clock', valueLabel: 'Playtime' },
        { type: 'placedblocks', label: 'Top Builders', icon: 'bi-grid-3x3', valueLabel: 'Blocks Placed' },
        { type: 'brokenblocks', label: 'Top Block Breakers', icon: 'bi-hammer', valueLabel: 'Blocks Broken' },
        { type: 'mobskilled', label: 'Top Mob Hunters', icon: 'bi-bug', valueLabel: 'Mobs Killed' },
        { type: 'sell', label: 'Top Sellers', icon: 'bi-tag', valueLabel: 'Sell Earnings' },
        { type: 'shop', label: 'Top Spenders', icon: 'bi-cart', valueLabel: 'Shop Spent' }
    ];
    
    // Store all leaderboard data for stats overview
    const leaderboardData = {};
    
    // Fetch all leaderboards in parallel
    const fetchPromises = categories.map(async (cat) => {
        try {
            const response = await fetch(`${API_BASE}/leaderboard?type=${cat.type}&page=1`);
            const data = await response.json();
            leaderboardData[cat.type] = data.result || [];
        } catch (error) {
            console.error(`Failed to fetch ${cat.type}:`, error);
            leaderboardData[cat.type] = [];
        }
    });
    
    await Promise.all(fetchPromises);
    
    // Update stats overview
    updateStatsOverview(leaderboardData);
    
    // Render current leaders section
    renderCurrentLeaders(leaderboardData, categories);
    
    // Render top players lists
    const listsToRender = ['money', 'shards', 'kills', 'deaths'];
    listsToRender.forEach(type => {
        const container = document.querySelector(`[data-leaderboard="${type}"]`);
        if (container && leaderboardData[type]) {
            const top5 = leaderboardData[type].slice(0, 5);
            const cat = categories.find(c => c.type === type);
            container.innerHTML = renderPlayerRows(top5, type, cat?.valueLabel || 'Value');
        }
    });
}

/**
 * Update the stats overview cards with totals
 */
function updateStatsOverview(data) {
    const stats = {
        'total-money': { data: data.money, format: formatMoney },
        'total-playtime': { data: data.playtime, format: (v) => formatPlaytime(v) },
        'total-kills': { data: data.kills, format: formatNumber },
        'total-deaths': { data: data.deaths, format: formatNumber },
        'total-placed': { data: data.placedblocks, format: formatNumber },
        'total-broken': { data: data.brokenblocks, format: formatNumber },
        'total-mobs': { data: data.mobskilled, format: formatNumber },
        'total-shards': { data: data.shards, format: formatNumber }
    };
    
    Object.entries(stats).forEach(([id, config]) => {
        const el = document.getElementById(id);
        if (el && config.data && config.data.length > 0) {
            const total = config.data.reduce((sum, p) => sum + (p.value || 0), 0);
            el.textContent = config.format(total);
        } else if (el) {
            el.textContent = '-';
        }
    });
}

/**
 * Render current leaders section with featured cards
 */
function renderCurrentLeaders(data, categories) {
    const container = document.getElementById('current-leaders');
    if (!container) return;
    
    const leaderCards = categories.slice(0, 10).map(cat => {
        const players = data[cat.type] || [];
        if (players.length === 0) return '';
        
        const leader = players[0];
        return `
            <a href="stats.html?user=${encodeURIComponent(leader.username)}" class="leader-card">
                <div class="leader-card-icon">
                    <i class="bi ${cat.icon}"></i>
                </div>
                <img src="${getPlayerHead(leader.username)}" alt="${leader.username}" class="leader-card-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/64'">
                <div class="leader-card-name">${leader.username}</div>
                <div class="leader-card-value">${formatLeaderboardValue(leader.value, cat.type)}</div>
                <div class="leader-card-label">${cat.valueLabel}</div>
            </a>
        `;
    }).join('');
    
    container.innerHTML = leaderCards || '<p class="no-data">No data available</p>';
}

/**
 * Render player rows for top players list
 */
function renderPlayerRows(players, type, valueLabel) {
    if (!players || players.length === 0) {
        return '<p class="no-data">No data available</p>';
    }
    
    return players.map((player, index) => {
        const rank = index + 1;
        return `
            <a href="stats.html?user=${encodeURIComponent(player.username)}" class="player-row">
                <div class="player-row-rank rank-${rank}">${rank}</div>
                <img src="${getPlayerHead(player.username)}" alt="${player.username}" class="player-row-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/36'">
                <div class="player-row-info">
                    <div class="player-row-name">${player.username}</div>
                    <div class="player-row-subtitle">${valueLabel}</div>
                </div>
                <div class="player-row-value">${formatLeaderboardValue(player.value, type)}</div>
            </a>
        `;
    }).join('');
}

/**
 * Render leaderboard cards for top players (legacy, keeping for compatibility)
 */
function renderLeaderboardCards(players, type) {
    const rankColors = ['gold', 'silver', 'bronze'];
    
    return players.map((player, index) => {
        const rankClass = rankColors[index] || '';
        return `
            <a href="stats.html?user=${encodeURIComponent(player.username)}" class="leaderboard-card">
                <div class="rank-badge ${rankClass}">${index + 1}</div>
                <img src="${getPlayerHead(player.username)}" alt="${player.username}" class="player-avatar" onerror="this.src='https://mc-heads.net/avatar/Steve/48'">
                <div class="player-info">
                    <span class="player-name">${player.username}</span>
                    <span class="player-value">${formatLeaderboardValue(player.value, type)}</span>
                </div>
            </a>
        `;
    }).join('');
}

/**
 * Load economy stats (legacy, for backward compatibility)
 */
async function loadEconomyStats() {
    // This function is now handled by initServerStatsPage
    // Keeping empty for compatibility
}

// ============================================
// Global Event Handlers
// ============================================

/**
 * Initialize header search
 */
function initHeaderSearch() {
    const searchForm = document.querySelector('.header-search');
    const searchInput = document.querySelector('.header-search input');
    
    if (!searchForm || !searchInput) return;
    
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = searchInput.value.trim();
        if (username) {
            window.location.href = `stats.html?user=${encodeURIComponent(username)}`;
        }
    });
}

/**
 * Initialize hero search
 */
function initHeroSearch() {
    const searchForm = document.querySelector('.hero-search');
    const searchInput = document.querySelector('.hero-search input');
    
    if (!searchForm || !searchInput) return;
    
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = searchInput.value.trim();
        if (username) {
            window.location.href = `stats.html?user=${encodeURIComponent(username)}`;
        }
    });
}

/**
 * Initialize stats page search
 */
function initStatsSearch() {
    const searchForm = document.querySelector('.stats-search');
    const searchInput = document.getElementById('player-search');
    
    if (!searchForm || !searchInput) return;
    
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = searchInput.value.trim();
        if (username) {
            window.location.href = `stats.html?user=${encodeURIComponent(username)}`;
        }
    });
}

/**
 * Initialize mobile menu
 */
function initMobileMenu() {
    const toggle = document.querySelector('.mobile-toggle');
    const nav = document.querySelector('.nav');
    
    if (!toggle || !nav) return;
    
    toggle.addEventListener('click', () => {
        nav.classList.toggle('active');
    });
    
    // Close menu on link click
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('active');
        });
    });
}

/**
 * Set active nav link based on current page
 */
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        link.classList.toggle('active', href === currentPage);
    });
}

// ============================================
// Server Stats Page
// ============================================

/**
 * Initialize Home page
 */
async function initHomePage() {
    // Run both API calls in parallel for faster loading
    await Promise.all([
        fetchMinecraftServerStatusAnimated(),
        loadAuctionCountAnimated()
    ]);
}

/**
 * Fetch server status with counting animation
 */
async function fetchMinecraftServerStatusAnimated() {
    const statusEl = document.getElementById('server-status');
    const playersEl = document.getElementById('players-online');
    const versionEl = document.getElementById('server-version');
    
    try {
        const response = await fetch('https://api.mcsrvstat.us/2/donutsmp.net');
        const data = await response.json();
        
        if (data.online) {
            if (statusEl) {
                statusEl.innerHTML = '<i class="bi bi-circle-fill text-success" style="font-size: 0.5em;"></i> Online';
            }
            if (playersEl) {
                const online = data.players?.online || 0;
                const max = data.players?.max || 50000;
                // Animate the player count
                animateNumberWithSuffix(playersEl, online, `/${max.toLocaleString()}`);
            }
            if (versionEl) versionEl.textContent = data.version || '1.21.x';
        } else {
            if (statusEl) statusEl.textContent = 'Offline';
            if (playersEl) playersEl.textContent = '0/0';
        }
    } catch (error) {
        console.error('Error fetching server status:', error);
        if (statusEl) statusEl.textContent = 'Unknown';
        if (playersEl) playersEl.textContent = 'N/A';
    }
}

/**
 * Load auction count with counting animation
 */
async function loadAuctionCountAnimated() {
    const auctionsEl = document.getElementById('active-auctions');
    if (!auctionsEl) return;
    
    try {
        const itemsPerPage = 44;
        
        // Fast approach: Check specific page numbers in parallel to quickly find range
        // Check pages 100, 500, 1000, 2000, 3000 simultaneously
        const checkPages = [100, 500, 1000, 1500, 2000, 2500];
        
        const results = await Promise.all(
            checkPages.map(page => 
                fetch(`${API_BASE}/auction?page=${page}`)
                    .then(res => res.json())
                    .then(data => ({ page, valid: data?.result?.length > 0 }))
                    .catch(() => ({ page, valid: false }))
            )
        );
        
        // Find the highest valid page from our checks
        let low = 1;
        let high = 100; // Default if all checks fail
        
        for (const result of results) {
            if (result.valid) {
                low = result.page;
            } else {
                high = result.page;
                break;
            }
        }
        
        // Now do a quick binary search in the narrowed range
        while (low + 50 < high) {
            const mid = Math.floor((low + high) / 2);
            try {
                const response = await fetch(`${API_BASE}/auction?page=${mid}`);
                const data = await response.json();
                
                if (data?.result?.length > 0) {
                    low = mid;
                } else {
                    high = mid;
                }
            } catch (e) {
                high = mid;
            }
        }
        
        // Final precise search - check in parallel for last ~50 pages
        const finalChecks = [];
        for (let p = low; p <= Math.min(low + 60, high + 10); p += 10) {
            finalChecks.push(p);
        }
        
        const finalResults = await Promise.all(
            finalChecks.map(page =>
                fetch(`${API_BASE}/auction?page=${page}`)
                    .then(res => res.json())
                    .then(data => ({ page, count: data?.result?.length || 0 }))
                    .catch(() => ({ page, count: 0 }))
            )
        );
        
        // Find the last page with results
        let lastValidPage = low;
        let lastPageItems = itemsPerPage;
        
        for (const result of finalResults) {
            if (result.count > 0) {
                lastValidPage = result.page;
                lastPageItems = result.count;
            }
        }
        
        const totalAuctions = (lastValidPage - 1) * itemsPerPage + lastPageItems;
        
        // Animate the count
        animateNumberWithFormat(auctionsEl, totalAuctions);
    } catch (error) {
        console.error('Error loading auction count:', error);
        if (auctionsEl) auctionsEl.textContent = 'N/A';
    }
}

/**
 * Animate number with a suffix (e.g., "/50000")
 */
function animateNumberWithSuffix(element, target, suffix = '') {
    if (!element) return;
    
    const duration = 1500;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(target * easeOut);
        
        element.textContent = currentValue.toLocaleString() + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target.toLocaleString() + suffix;
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Animate number with abbreviated format (K, M, B)
 */
function animateNumberWithFormat(element, target) {
    if (!element) return;
    
    const duration = 1500;
    const startTime = performance.now();
    
    function formatVal(value) {
        if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
        if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
        if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
        return Math.floor(value).toLocaleString();
    }
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = target * easeOut;
        
        element.textContent = formatVal(currentValue);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = formatVal(target);
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Initialize Server Stats page
 */
async function initServerStatsPage() {
    // Fetch all stats in parallel for faster loading
    await Promise.all([
        fetchMinecraftServerStatus(),
        calculateAggregateStatsParallel(),
        loadAuctionCount()
    ]);
}

/**
 * Load server statistics (legacy)
 */
async function loadServerStats() {
    try {
        await Promise.all([
            fetchMinecraftServerStatus(),
            calculateAggregateStatsParallel(),
            loadAuctionCount()
        ]);
    } catch (error) {
        console.error('Error loading server stats:', error);
    }
}

/**
 * Calculate aggregate stats with parallel fetching
 */
async function calculateAggregateStatsParallel() {
    const categories = ['money', 'shards', 'kills', 'deaths', 'playtime', 'placedblocks', 'brokenblocks', 'mobskilled'];
    
    try {
        // Fetch first page of each category in parallel
        const responses = await Promise.all(
            categories.map(cat => 
                fetch(`${API_BASE}/leaderboard?type=${cat}&page=1`)
                    .then(res => res.json())
                    .catch(() => ({ result: [] }))
            )
        );
        
        const totals = {};
        categories.forEach((cat, index) => {
            const data = responses[index];
            if (data && data.result) {
                let total = 0;
                data.result.forEach(player => {
                    const value = parseFloat(String(player.value).replace(/[,$]/g, '')) || 0;
                    total += value;
                });
                // Multiply by estimated pages for more accurate total
                totals[cat] = total * 50; // Rough estimate
            }
        });
        
        // Update UI with animated values
        updateStatWithAnimation('total-money', totals.money, '$');
        updateStatWithAnimation('total-shards', totals.shards);
        updateStatWithAnimation('total-kills', totals.kills);
        updateStatWithAnimation('total-deaths', totals.deaths);
        updateStatWithAnimation('total-blocks-placed', totals.placedblocks);
        updateStatWithAnimation('total-blocks-broken', totals.brokenblocks);
        updateStatWithAnimation('total-mobs-killed', totals.mobskilled);
        
        // Update playtime separately
        const totalPlaytime = document.getElementById('total-playtime');
        if (totalPlaytime && totals.playtime) {
            const ms = totals.playtime;
            const hours = Math.floor(ms / (1000 * 60 * 60));
            const days = Math.floor(hours / 24);
            const years = Math.floor(days / 365);
            if (years > 0) {
                totalPlaytime.textContent = `${years.toLocaleString()}y+`;
            } else {
                totalPlaytime.textContent = `${days.toLocaleString()}d+`;
            }
        }
        
        // Set player count
        const totalPlayers = document.getElementById('total-players');
        if (totalPlayers) {
            totalPlayers.textContent = '50,000+';
        }
        
    } catch (error) {
        console.error('Error calculating aggregate stats:', error);
    }
}

/**
 * Update a stat element with counting animation
 */
function updateStatWithAnimation(elementId, value, prefix = '') {
    const element = document.getElementById(elementId);
    if (!element || !value) return;
    
    animateNumberWithFormat(element, value);
    if (prefix) {
        const originalUpdate = element.textContent;
        element.dataset.prefix = prefix;
    }
}

/**
 * Fetch Minecraft server status from mcsrvstat.us API
 */
async function fetchMinecraftServerStatus() {
    const statusEl = document.getElementById('server-status');
    const playersEl = document.getElementById('players-online');
    const uptimeEl = document.getElementById('server-uptime');
    const versionEl = document.getElementById('server-version');
    
    try {
        const response = await fetch('https://api.mcsrvstat.us/2/donutsmp.net');
        const data = await response.json();
        
        if (data.online) {
            if (statusEl) statusEl.textContent = 'Online';
            if (playersEl) {
                const online = data.players?.online || 0;
                const max = data.players?.max || 50000;
                playersEl.textContent = `${online.toLocaleString()}/${max.toLocaleString()}`;
            }
            if (versionEl) versionEl.textContent = data.version || '1.21.x';
            
            // Add online status class
            const statusCard = statusEl?.closest('.server-status-card');
            if (statusCard) statusCard.classList.add('status-online');
        } else {
            if (statusEl) statusEl.textContent = 'Offline';
            if (playersEl) playersEl.textContent = '0';
            
            // Remove online status class
            const statusCard = statusEl?.closest('.server-status-card');
            if (statusCard) statusCard.classList.remove('status-online');
        }
        
        if (uptimeEl) uptimeEl.textContent = '99.9%';
        
    } catch (error) {
        console.error('Error fetching server status:', error);
        if (statusEl) statusEl.textContent = 'Unknown';
        if (playersEl) playersEl.textContent = 'N/A';
        if (uptimeEl) uptimeEl.textContent = 'N/A';
    }
}

/**
 * Calculate aggregate stats from leaderboard data
 */
async function calculateAggregateStats() {
    const categories = ['money', 'shards', 'kills', 'deaths', 'playtime', 'placedblocks', 'brokenblocks', 'mobskilled'];
    const totals = {};
    
    try {
        // Fetch multiple pages of each category for better totals
        const fetchPages = async (cat) => {
            let total = 0;
            for (let page = 1; page <= 3; page++) {
                try {
                    const res = await fetch(`${API_BASE}/leaderboard?type=${cat}&page=${page}`);
                    const data = await res.json();
                    if (data && data.result) {
                        data.result.forEach(player => {
                            const value = parseFloat(String(player.value).replace(/[,$]/g, '')) || 0;
                            total += value;
                        });
                    }
                } catch (e) {
                    console.error(`Error fetching ${cat} page ${page}:`, e);
                }
            }
            return total;
        };
        
        // Fetch all categories in parallel
        const results = await Promise.all(categories.map(async (cat) => {
            const total = await fetchPages(cat);
            return { cat, total };
        }));
        
        results.forEach(({ cat, total }) => {
            totals[cat] = total;
        });
        
        // Update UI elements with formatted values
        const totalMoney = document.getElementById('total-money');
        const totalShards = document.getElementById('total-shards');
        const totalPlayers = document.getElementById('total-players');
        const totalBlocksPlaced = document.getElementById('total-blocks-placed');
        const totalBlocksBroken = document.getElementById('total-blocks-broken');
        const totalMobsKilled = document.getElementById('total-mobs-killed');
        const totalPlaytime = document.getElementById('total-playtime');
        const totalKills = document.getElementById('total-kills');
        const totalDeaths = document.getElementById('total-deaths');
        
        // Format large numbers nicely
        const formatLargeNumber = (num) => {
            if (num >= 1e15) return (num / 1e15).toFixed(1) + 'Q';
            if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toLocaleString();
        };
        
        if (totalMoney && totals.money) {
            totalMoney.textContent = '$' + formatLargeNumber(totals.money);
        }
        if (totalShards && totals.shards) {
            totalShards.textContent = formatLargeNumber(totals.shards);
        }
        if (totalPlayers) {
            totalPlayers.textContent = '50,000+';
        }
        if (totalBlocksPlaced && totals.placedblocks) {
            totalBlocksPlaced.textContent = formatLargeNumber(totals.placedblocks);
        }
        if (totalBlocksBroken && totals.brokenblocks) {
            totalBlocksBroken.textContent = formatLargeNumber(totals.brokenblocks);
        }
        if (totalMobsKilled && totals.mobskilled) {
            totalMobsKilled.textContent = formatLargeNumber(totals.mobskilled);
        }
        if (totalPlaytime && totals.playtime) {
            // Convert milliseconds to readable format
            const totalMs = totals.playtime;
            const totalHours = Math.floor(totalMs / (1000 * 60 * 60));
            const totalDays = Math.floor(totalHours / 24);
            const years = Math.floor(totalDays / 365);
            const remainingDays = totalDays % 365;
            
            if (years > 0) {
                totalPlaytime.textContent = `${years.toLocaleString()}y ${remainingDays}d`;
            } else if (totalDays > 0) {
                totalPlaytime.textContent = `${totalDays.toLocaleString()} days`;
            } else {
                totalPlaytime.textContent = `${totalHours.toLocaleString()} hours`;
            }
        }
        if (totalKills && totals.kills) {
            totalKills.textContent = formatLargeNumber(totals.kills);
        }
        if (totalDeaths && totals.deaths) {
            totalDeaths.textContent = formatLargeNumber(totals.deaths);
        }
        
    } catch (error) {
        console.error('Error calculating aggregate stats:', error);
    }
}

/**
 * Load auction count using fast parallel checking
 */
async function loadAuctionCount() {
    try {
        const auctionsEl = document.getElementById('active-auctions');
        if (!auctionsEl) return;
        
        const itemsPerPage = 44;
        
        // Fast approach: Check specific page numbers in parallel
        const checkPages = [100, 500, 1000, 1500, 2000, 2500];
        
        const results = await Promise.all(
            checkPages.map(page => 
                fetch(`${API_BASE}/auction?page=${page}`)
                    .then(res => res.json())
                    .then(data => ({ page, valid: data?.result?.length > 0 }))
                    .catch(() => ({ page, valid: false }))
            )
        );
        
        // Find the highest valid page from our checks
        let low = 1;
        let high = 100;
        
        for (const result of results) {
            if (result.valid) {
                low = result.page;
            } else {
                high = result.page;
                break;
            }
        }
        
        // Quick binary search in narrowed range
        while (low + 50 < high) {
            const mid = Math.floor((low + high) / 2);
            try {
                const response = await fetch(`${API_BASE}/auction?page=${mid}`);
                const data = await response.json();
                
                if (data?.result?.length > 0) {
                    low = mid;
                } else {
                    high = mid;
                }
            } catch (e) {
                high = mid;
            }
        }
        
        // Final parallel check for precision
        const finalChecks = [];
        for (let p = low; p <= Math.min(low + 60, high + 10); p += 10) {
            finalChecks.push(p);
        }
        
        const finalResults = await Promise.all(
            finalChecks.map(page =>
                fetch(`${API_BASE}/auction?page=${page}`)
                    .then(res => res.json())
                    .then(data => ({ page, count: data?.result?.length || 0 }))
                    .catch(() => ({ page, count: 0 }))
            )
        );
        
        let lastValidPage = low;
        let lastPageItems = itemsPerPage;
        
        for (const result of finalResults) {
            if (result.count > 0) {
                lastValidPage = result.page;
                lastPageItems = result.count;
            }
        }
        
        const totalAuctions = (lastValidPage - 1) * itemsPerPage + lastPageItems;
        auctionsEl.textContent = formatAbbreviated(totalAuctions);
    } catch (error) {
        console.error('Error loading auction count:', error);
        const auctionsEl = document.getElementById('active-auctions');
        if (auctionsEl) auctionsEl.textContent = 'N/A';
    }
}

// ============================================
// Prices Page
// ============================================

/**
 * Initialize Prices page
 */
// ============================================
// Prices Page
// ============================================

let allPrices = [];
let filteredPrices = [];
let pricesCurrentPage = 1;
const pricesPerPage = 30; // Matches backend

async function initPricesPage() {
    const container = document.getElementById('prices-container');
    const paginationContainer = document.getElementById('prices-pagination');
    const searchInput = document.getElementById('price-search-input');
    const sortSelect = document.getElementById('price-sort-select');
    
    if (!container) return;
    
    // Load all price data
    await loadAllPrices();
    
    // Set up search
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterAndRenderPrices();
        }, 300));
    }
    
    // Set up sort
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            filterAndRenderPrices();
        });
    }
}

async function loadAllPrices() {
    const container = document.getElementById('prices-container');
    
    try {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading prices...</p>
            </div>
        `;
        
        // Fetch first page to get pagination info and initial data
        const response = await fetch(`${API_BASE}/prices?page=1`);
        const data = await response.json();
        
        if (data.status === 200 && data.result) {
            // Update stats
            if (data.meta) {
                updatePriceStats(data.meta, data.pagination);
            }
            
            // Store first page data
            allPrices = data.result;
            filteredPrices = [...allPrices];
            
            // Render first page immediately for fast UX
            filterAndRenderPrices();
            
            // If there are more pages, fetch them in the background
            if (data.pagination && data.pagination.total_pages > 1) {
                loadRemainingPrices(2, data.pagination.total_pages);
            }
        } else {
            throw new Error('Failed to load prices');
        }
        
    } catch (error) {
        console.error('Error loading prices:', error);
        container.innerHTML = `
            <div class="prices-empty">
                <i class="bi bi-exclamation-triangle"></i>
                <h3>Failed to Load Prices</h3>
                <p>Unable to fetch price data. Please try again later.</p>
            </div>
        `;
    }
}

// Load remaining price pages in background
async function loadRemainingPrices(startPage, totalPages) {
    // Fetch remaining pages in parallel for speed
    const pagePromises = [];
    for (let page = startPage; page <= totalPages; page++) {
        pagePromises.push(
            fetch(`${API_BASE}/prices?page=${page}`)
                .then(res => res.json())
                .then(data => data.status === 200 ? data.result : [])
                .catch(() => [])
        );
    }
    
    try {
        const results = await Promise.all(pagePromises);
        const additionalItems = results.flat();
        
        if (additionalItems.length > 0) {
            allPrices = allPrices.concat(additionalItems);
            // Re-apply current filter/sort
            filterAndRenderPrices();
        }
    } catch (error) {
        console.error('Error loading additional prices:', error);
    }
}

function updatePriceStats(meta, pagination) {
    const totalItems = document.getElementById('total-items');
    const totalListings = document.getElementById('total-listings');
    const lastUpdated = document.getElementById('price-last-updated');
    
    if (totalItems) totalItems.textContent = meta.unique_items?.toLocaleString() || '--';
    if (totalListings) totalListings.textContent = meta.total_listings_scanned?.toLocaleString() || '--';
    if (lastUpdated) lastUpdated.textContent = 'Just now';
}

function filterAndRenderPrices() {
    const searchInput = document.getElementById('price-search-input');
    const sortSelect = document.getElementById('price-sort-select');
    const searchQuery = searchInput?.value?.toLowerCase().trim() || '';
    const sortBy = sortSelect?.value || 'name';
    
    // Filter
    if (searchQuery) {
        filteredPrices = allPrices.filter(item => 
            item.name.toLowerCase().includes(searchQuery) ||
            item.id.toLowerCase().includes(searchQuery)
        );
    } else {
        filteredPrices = [...allPrices];
    }
    
    // Sort
    filteredPrices.sort((a, b) => {
        switch (sortBy) {
            case 'avg_high':
                return b.avg_price - a.avg_price;
            case 'avg_low':
                return a.avg_price - b.avg_price;
            case 'listings':
                return b.listings - a.listings;
            case 'name':
            default:
                return a.name.localeCompare(b.name);
        }
    });
    
    // Reset to page 1 on filter change
    pricesCurrentPage = 1;
    
    renderPrices();
}

function renderPrices() {
    const container = document.getElementById('prices-container');
    const paginationContainer = document.getElementById('prices-pagination');
    
    if (!container) return;
    
    const totalPages = Math.ceil(filteredPrices.length / pricesPerPage);
    const startIndex = (pricesCurrentPage - 1) * pricesPerPage;
    const endIndex = startIndex + pricesPerPage;
    const pageItems = filteredPrices.slice(startIndex, endIndex);
    
    if (pageItems.length === 0) {
        container.innerHTML = `
            <div class="prices-empty">
                <i class="bi bi-search"></i>
                <h3>No Items Found</h3>
                <p>Try adjusting your search or check back later.</p>
            </div>
        `;
        paginationContainer.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="prices-grid">
            ${pageItems.map(item => createPriceCard(item)).join('')}
        </div>
    `;
    
    // Render pagination
    if (totalPages > 1) {
        paginationContainer.innerHTML = `
            <button class="page-btn" ${pricesCurrentPage <= 1 ? 'disabled' : ''} onclick="changePricesPage(${pricesCurrentPage - 1})">
                <i class="bi bi-chevron-left"></i> Previous
            </button>
            <span class="page-info">Page ${pricesCurrentPage} of ${totalPages}</span>
            <button class="page-btn" ${pricesCurrentPage >= totalPages ? 'disabled' : ''} onclick="changePricesPage(${pricesCurrentPage + 1})">
                Next <i class="bi bi-chevron-right"></i>
            </button>
        `;
    } else {
        paginationContainer.innerHTML = '';
    }
}

function createPriceCard(item) {
    const itemName = item.name || formatItemName(item.id);
    const itemId = item.id.replace('minecraft:', '');
    
    // Get item icon URL from Minecraft API
    const iconUrl = getItemImageUrl(item.id);
    
    // Store price history for tracking
    storePriceHistory(itemId, item.median_price);
    
    // Get price history and generate sparkline
    const priceHistory = getPriceHistory(itemId);
    const sparkline = generateSparkline(priceHistory);
    const trend = calculatePriceTrend(priceHistory);
    
    // Escape data for onclick
    const itemData = encodeURIComponent(JSON.stringify(item));
    
    return `
        <div class="price-card" onclick="openPriceModal('${itemData}')">
            <div class="price-card-header">
                <div class="price-card-icon">
                    <img src="${iconUrl}" alt="${itemName}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'bi bi-box\\'></i>';">
                </div>
                <div class="price-card-title">
                    <h3>${itemName}</h3>
                    <span>${itemId}</span>
                </div>
                <div class="price-card-trend">
                    ${sparkline}
                    ${trend ? `<span class="price-trend ${trend.direction}">${trend.direction === 'up' ? '+' : ''}${trend.percentage}%</span>` : ''}
                </div>
            </div>
            <div class="price-card-stats three-stats">
                <div class="price-stat">
                    <span class="price-stat-label">Low</span>
                    <span class="price-stat-value min">${formatPriceValue(item.min_price)}</span>
                </div>
                <div class="price-stat">
                    <span class="price-stat-label">Median</span>
                    <span class="price-stat-value median">${formatPriceValue(item.median_price)}</span>
                </div>
                <div class="price-stat">
                    <span class="price-stat-label">High</span>
                    <span class="price-stat-value max">${formatPriceValue(item.max_price)}</span>
                </div>
            </div>
            <div class="price-card-footer">
                <span class="price-card-listings">${item.listings} listing${item.listings !== 1 ? 's' : ''}</span>
                <span class="price-card-view"><i class="bi bi-graph-up"></i> View Chart</span>
            </div>
        </div>
    `;
}

function formatItemName(id) {
    // Remove minecraft: prefix and format
    const name = id.replace('minecraft:', '').replace(/_/g, ' ');
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatPriceValue(value) {
    if (value === null || value === undefined) return 'N/A';
    
    const num = parseFloat(value);
    if (isNaN(num)) return 'N/A';
    
    if (num >= 1e12) {
        return '$' + (num / 1e12).toFixed(1) + 'T';
    } else if (num >= 1e9) {
        return '$' + (num / 1e9).toFixed(1) + 'B';
    } else if (num >= 1e6) {
        return '$' + (num / 1e6).toFixed(1) + 'M';
    } else if (num >= 1e3) {
        return '$' + (num / 1e3).toFixed(1) + 'K';
    }
    return '$' + num.toLocaleString();
}

function changePricesPage(page) {
    const totalPages = Math.ceil(filteredPrices.length / pricesPerPage);
    if (page < 1 || page > totalPages) return;
    
    pricesCurrentPage = page;
    renderPrices();
    
    // Scroll to top of container
    document.getElementById('prices-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Price Chart Modal
let priceChart = null;

function openPriceModal(itemDataEncoded) {
    try {
        const item = JSON.parse(decodeURIComponent(itemDataEncoded));
        const modal = document.getElementById('price-chart-modal');
        if (!modal) return;
        
        const itemId = item.id.replace('minecraft:', '');
        const itemName = item.name || formatItemName(item.id);
        const iconUrl = getItemImageUrl(item.id);
        
        // Update modal content
        document.getElementById('modal-item-name').textContent = itemName;
        document.getElementById('modal-item-id').textContent = item.id;
        document.getElementById('modal-avg-price').textContent = formatPriceValue(item.avg_price);
        document.getElementById('modal-median-price').textContent = formatPriceValue(item.median_price);
        document.getElementById('modal-min-price').textContent = formatPriceValue(item.min_price);
        document.getElementById('modal-max-price').textContent = formatPriceValue(item.max_price);
        
        // Update icon with proper error handling
        const iconContainer = document.getElementById('modal-item-icon');
        iconContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = iconUrl;
        img.alt = itemName;
        img.onerror = function() {
            this.style.display = 'none';
            iconContainer.innerHTML = '<i class="bi bi-box"></i>';
        };
        iconContainer.appendChild(img);
        
        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Create chart
        createPriceChart(item);
        
    } catch (error) {
        console.error('Error opening price modal:', error);
    }
}

function closePriceModal() {
    const modal = document.getElementById('price-chart-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Destroy chart
    if (priceChart) {
        priceChart.destroy();
        priceChart = null;
    }
}

function createPriceChart(item) {
    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    
    // Destroy existing chart
    if (priceChart) {
        priceChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    
    // Generate simulated price history based on current data
    // Since we don't have historical data, we'll show a price range visualization
    const labels = ['Min', 'Q1', 'Median', 'Q3', 'Max'];
    
    // Calculate quartile values
    const min = item.min_price;
    const max = item.max_price;
    const median = item.median_price;
    const avg = item.avg_price;
    
    // Estimate Q1 and Q3
    const q1 = min + (median - min) * 0.5;
    const q3 = median + (max - median) * 0.5;
    
    const data = [min, q1, median, q3, max];
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Price Distribution',
                    data: data,
                    borderColor: '#2E8AFF',
                    backgroundColor: 'rgba(46, 138, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2E8AFF',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                },
                {
                    label: 'Average',
                    data: [avg, avg, avg, avg, avg],
                    borderColor: '#10B981',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#94a3b8',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatPriceValue(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            family: 'Poppins',
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            family: 'Poppins',
                            size: 11
                        },
                        callback: function(value) {
                            return formatPriceValue(value);
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePriceModal();
    }
});

// Close modal on backdrop click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('price-chart-modal');
    if (modal && e.target === modal) {
        closePriceModal();
    }
});

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme first
    initTheme();
    
    // Global initializations
    initHeaderSearch();
    initHeroSearch();
    initMobileMenu();
    setActiveNavLink();
    initAnimatedCounters();
    
    // Initialize autocomplete on all search inputs
    document.querySelectorAll('input[name="user"]').forEach(input => {
        initAutocomplete(input);
    });
    
    // Theme toggle handler
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Auto-refresh toggle handler
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('click', toggleAutoRefresh);
    }
    
    // Page-specific initializations
    const page = document.body.dataset.page;
    
    switch (page) {
        case 'home':
            initHomePage();
            break;
        case 'stats':
            initStatsSearch();
            initStatsPage();
            break;
        case 'leaderboards':
            initLeaderboardsPage();
            break;
        case 'auction':
            initAuctionPage();
            break;
        case 'server-stats':
            initServerStatsPage();
            break;
        case 'prices':
            initPricesPage();
            break;
    }
});

// Add CSS animations via JS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ============================================
// Floating Items Animation (JS-controlled)
// ============================================

/**
 * Initialize floating background items with random movement
 */
function initFloatingItems() {
    const container = document.querySelector('.floating-items-container');
    if (!container) return;
    
    const items = container.querySelectorAll('.floating-item');
    if (items.length === 0) return;
    
    // Bigger item sizes (12 items now)
    const sizes = [120, 100, 130, 95, 110, 90, 140, 105, 115, 125, 108, 98];
    
    // Starting positions OFF-SCREEN from all 4 sides, flowing inward
    // Each item starts outside the viewport and moves toward the center
    const startPositions = [
        { x: -150, y: 0.2, side: 'left' },      // From left
        { x: 1.1, y: 0.3, side: 'right' },      // From right  
        { x: 0.3, y: -150, side: 'top' },       // From top
        { x: 0.7, y: 1.1, side: 'bottom' },     // From bottom
        { x: -150, y: 0.6, side: 'left' },      // From left
        { x: 1.1, y: 0.7, side: 'right' },      // From right
        { x: 0.5, y: -150, side: 'top' },       // From top
        { x: 0.4, y: 1.1, side: 'bottom' },     // From bottom
        { x: -150, y: 0.4, side: 'left' },      // From left
        { x: 1.1, y: 0.5, side: 'right' },      // From right (mace)
        { x: 0.6, y: -150, side: 'top' },       // From top (elytra)
        { x: 0.2, y: 1.1, side: 'bottom' }      // From bottom (potion)
    ];
    
    // Directions pointing INWARD based on which side they start from
    const directions = [
        { vx: 0.20, vy: 0.05 },    // From left -> right
        { vx: -0.20, vy: 0.03 },   // From right -> left
        { vx: 0.03, vy: 0.20 },    // From top -> down
        { vx: -0.02, vy: -0.20 },  // From bottom -> up
        { vx: 0.18, vy: -0.06 },   // From left -> right-up
        { vx: -0.17, vy: -0.08 }, // From right -> left-up
        { vx: -0.05, vy: 0.18 },   // From top -> down-left
        { vx: 0.06, vy: -0.17 },   // From bottom -> up-right
        { vx: 0.19, vy: 0.08 },    // From left -> right-down
        { vx: -0.16, vy: 0.10 },   // From right -> left-down (mace)
        { vx: 0.08, vy: 0.19 },    // From top -> down-right (elytra)
        { vx: -0.07, vy: -0.18 }   // From bottom -> up-left (potion)
    ];
    
    // Initialize each item starting OFF-SCREEN
    items.forEach((item, index) => {
        // Set size
        item.style.width = (sizes[index] || 100) + 'px';
        
        // Calculate starting position (off-screen)
        const startPos = startPositions[index] || startPositions[0];
        let startX, startY;
        
        if (startPos.side === 'left') {
            startX = -150; // Off left edge
            startY = startPos.y * window.innerHeight;
        } else if (startPos.side === 'right') {
            startX = window.innerWidth + 50; // Off right edge
            startY = startPos.y * window.innerHeight;
        } else if (startPos.side === 'top') {
            startX = startPos.x * window.innerWidth;
            startY = -150; // Off top edge
        } else { // bottom
            startX = startPos.x * window.innerWidth;
            startY = window.innerHeight + 50; // Off bottom edge
        }
        
        // Use preset directions (pointing inward)
        const dir = directions[index] || directions[0];
        
        // First item gets zoom in/out effect (like moving towards/away)
        const isZoomItem = index === 0;
        
        // Store animation data on the element
        item.floatData = {
            x: startX,
            y: startY,
            rotation: Math.random() * 360,
            // Speed 0.20, flowing inward from edges
            vx: dir.vx,
            vy: dir.vy,
            vr: (Math.random() > 0.5 ? 1 : -1) * 0.15, // slower rotation speed
            // Zoom effect for first item, subtle for others
            scale: isZoomItem ? 1 : 1,
            scaleDir: 1,
            scaleSpeed: isZoomItem ? 0.003 : 0.0005, // much bigger zoom for first item
            isZoomItem: isZoomItem,
            scaleMin: isZoomItem ? 0.4 : 0.94, // zooms out far
            scaleMax: isZoomItem ? 1.5 : 1.08  // zooms in close
        };
        
        // Apply initial position (off-screen)
        item.style.left = startX + 'px';
        item.style.top = startY + 'px';
        item.style.transform = `rotate(${item.floatData.rotation}deg)`;
    });
    
    // Start animation loop
    animateFloatingItems(items);
}

/**
 * Animation loop for floating items - SMOOTH floating
 */
function animateFloatingItems(items) {
    const itemsArray = Array.from(items);
    
    function animate() {
        // Update positions
        itemsArray.forEach(item => {
            const data = item.floatData;
            if (!data) return;
            
            // Smooth position update
            data.x += data.vx;
            data.y += data.vy;
            data.rotation += data.vr;
            
            // Zoom effect - first item zooms in/out dramatically
            data.scale += data.scaleSpeed * data.scaleDir;
            if (data.scale > data.scaleMax) {
                data.scaleDir = -1;
            } else if (data.scale < data.scaleMin) {
                data.scaleDir = 1;
            }
            
            // PORTAL EFFECT: When item goes off one side, appear on opposite side
            const itemSize = 150;
            if (data.x < -itemSize) {
                data.x = window.innerWidth + 10; // Appear from right
            } else if (data.x > window.innerWidth + itemSize) {
                data.x = -10; // Appear from left
            }
            
            if (data.y < -itemSize) {
                data.y = window.innerHeight + 10; // Appear from bottom
            } else if (data.y > window.innerHeight + itemSize) {
                data.y = -10; // Appear from top
            }
            
            // Gentle random direction changes
            if (Math.random() < 0.001) {
                data.vx += (Math.random() - 0.5) * 0.05;
                data.vy += (Math.random() - 0.5) * 0.05;
            }
            
            // Limit velocity - max speed 0.25
            const maxSpeed = 0.25;
            const speed = Math.sqrt(data.vx * data.vx + data.vy * data.vy);
            if (speed > maxSpeed) {
                data.vx = (data.vx / speed) * maxSpeed;
                data.vy = (data.vy / speed) * maxSpeed;
            }
            
            // Keep minimum speed 0.15
            const minSpeed = 0.15;
            if (speed < minSpeed && speed > 0) {
                data.vx = (data.vx / speed) * minSpeed;
                data.vy = (data.vy / speed) * minSpeed;
            } else if (speed === 0) {
                data.vx = (Math.random() - 0.5) * 0.2;
                data.vy = (Math.random() - 0.5) * 0.2;
            }
            
            // Apply transform smoothly
            item.style.left = data.x + 'px';
            item.style.top = data.y + 'px';
            item.style.transform = `rotate(${data.rotation}deg) scale(${data.scale})`;
        });
        
        // COLLISION DETECTION: Items bounce off each other
        for (let i = 0; i < itemsArray.length; i++) {
            for (let j = i + 1; j < itemsArray.length; j++) {
                const item1 = itemsArray[i];
                const item2 = itemsArray[j];
                const data1 = item1.floatData;
                const data2 = item2.floatData;
                
                if (!data1 || !data2) continue;
                
                // Calculate distance between items
                const dx = data2.x - data1.x;
                const dy = data2.y - data1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Collision radius (items are about 100-140px wide)
                const collisionRadius = 80;
                
                if (distance < collisionRadius && distance > 0) {
                    // Normalize the collision vector
                    const nx = dx / distance;
                    const ny = dy / distance;
                    
                    // Swap velocities along collision axis (simple elastic collision)
                    const dvx = data1.vx - data2.vx;
                    const dvy = data1.vy - data2.vy;
                    const dvn = dvx * nx + dvy * ny;
                    
                    // Only bounce if items are moving toward each other
                    if (dvn > 0) {
                        data1.vx -= dvn * nx;
                        data1.vy -= dvn * ny;
                        data2.vx += dvn * nx;
                        data2.vy += dvn * ny;
                        
                        // Separate items to prevent sticking
                        const overlap = collisionRadius - distance;
                        data1.x -= overlap * nx * 0.5;
                        data1.y -= overlap * ny * 0.5;
                        data2.x += overlap * nx * 0.5;
                        data2.y += overlap * ny * 0.5;
                    }
                }
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    requestAnimationFrame(animate);
}

// Initialize floating items when DOM is ready
document.addEventListener('DOMContentLoaded', initFloatingItems);
// Also init on window load in case DOMContentLoaded already fired
if (document.readyState === 'complete') {
    initFloatingItems();
}
