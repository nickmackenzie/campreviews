// Create the auth service namespace first
window.authService = {};

// Initialize PocketBase instance
window.authService.pb = new PocketBase('https://reviews.pockethost.io');

// Initialize auth state
window.authService.initializePocketBase = async function() {
    try {
        const { authStore } = await chrome.storage.local.get('authStore');
        if (authStore) {
            const authData = JSON.parse(authStore);
            if (authData.token && authData.model) {
                this.pb.authStore.save(authData.token, authData.model);
            }
            console.log('Auth state loaded:', {
                isValid: this.pb.authStore.isValid,
                token: !!this.pb.authStore.token,
                model: !!this.pb.authStore.model
            });
        }
    } catch (error) {
        console.error('Error loading auth state:', error);
    }
    return this.pb;
};

// Broadcast auth state changes to all tabs
window.authService.broadcastAuthState = async function(authData, clearAuth = false) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'AUTH_STATE_CHANGED',
                authData,
                clearAuth
            });
        });
    });
}; 