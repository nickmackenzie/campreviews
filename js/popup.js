    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize PocketBase and auth state
        await window.authService.initializePocketBase();
        
        // Update UI based on actual auth state
        updateUI(window.authService.pb.authStore.isValid);

        // Login button click handler
        document.getElementById('loginBtn').addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const authData = await window.authService.pb.collection('users').authWithPassword(email, password);
                
                // Save auth data to storage
                await chrome.storage.local.set({ 
                    authStore: JSON.stringify({
                        token: window.authService.pb.authStore.token,
                        model: window.authService.pb.authStore.model
                    })
                });
                
                // Update UI
                showMessage('Logged in successfully!', true);
                updateUI(true);
                
                // Broadcast to ALL tabs
                window.authService.broadcastAuthState(true);
            } catch (error) {
                showMessage(error.message, false);
            }
        });

        // Register button click handler
        document.getElementById('registerBtn').addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const user = await window.authService.pb.collection('users').create({
                    email,
                    password,
                    passwordConfirm: password,
                });
                showMessage('Registered successfully! Please login.', true);
            } catch (error) {
                showMessage(error.message, false);
            }
        });

        // Logout button click handler
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            try {
                // Clear PocketBase auth store
                window.authService.pb.authStore.clear();
                
                // Clear stored tokens
                await chrome.storage.local.remove('authStore');
                
                // Update UI
                updateUI(false);
                showMessage('Logged out successfully!', true);
                
                // Broadcast logout to ALL tabs
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'AUTH_STATE_CHANGED',
                            authData: null,
                            clearAuth: true
                        }).catch(err => {
                            // Ignore errors from inactive tabs
                            console.log('Tab message error:', err);
                        });
                    });

                });
            } catch (error) {
                console.error('Logout error:', error);
                showMessage('Error logging out', false);
            }
        });
    });

    function updateUI(isLoggedIn) {
        const loginForm = document.getElementById('loginForm');
        const userInfo = document.getElementById('userInfo');
        const userEmail = document.getElementById('userEmail');

        if (isLoggedIn && window.authService.pb.authStore.model) {
            loginForm.style.display = 'none';
            userInfo.style.display = 'block';
            userEmail.textContent = window.authService.pb.authStore.model.email;
        } else {
            loginForm.style.display = 'block';
            userInfo.style.display = 'none';
            userEmail.textContent = '';
        }
    }

    function showMessage(message, isSuccess) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = message;
        messageEl.className = isSuccess ? 'success' : 'error';
    }

    // Add this function to broadcast auth state changes
    function broadcastAuthState(isLoggedIn) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'AUTH_STATE_CHANGED',
                isLoggedIn: isLoggedIn
            });
        }); 
    }
    