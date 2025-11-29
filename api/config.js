// DonutSMP API Configuration
// IMPORTANT: Set your API key in Vercel Environment Variables as DONUT_API_KEY

const API_BASE = 'https://api.donutsmp.net/v1';
const API_KEY = process.env.DONUT_API_KEY;
const REQUEST_TIMEOUT = 30000; // 30 seconds in ms

/**
 * Make authenticated API request to DonutSMP
 */
async function makeApiRequest(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    
    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        return {
            success: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            return {
                success: false,
                status: 500,
                data: {
                    message: 'Request timeout',
                    reason: 'Timeout',
                    status: 500
                }
            };
        }
        return {
            success: false,
            status: 500,
            data: {
                message: 'Request failed: ' + error.message,
                reason: 'Connection Error',
                status: 500
            }
        };
    }
}

/**
 * Sanitize input string
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/<[^>]*>/g, '').substring(0, 100);
}

/**
 * Validate Minecraft username
 */
function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{1,16}$/.test(username);
}

/**
 * Validate page number
 */
function validatePage(page, min = 1, max = 0) {
    const num = parseInt(page) || min;
    if (num < min) return min;
    if (max > 0 && num > max) return max;
    return num;
}

/**
 * Send JSON response with CORS headers
 */
function sendResponse(res, data, statusCode = 200) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');
    res.status(statusCode).json(data);
}

/**
 * Handle CORS preflight
 */
function handleCors(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(200).end();
        return true;
    }
    return false;
}

module.exports = {
    API_BASE,
    API_KEY,
    REQUEST_TIMEOUT,
    makeApiRequest,
    sanitizeInput,
    isValidUsername,
    validatePage,
    sendResponse,
    handleCors
};
