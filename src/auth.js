// SignalGPT Authentication Module
// Handles Google OAuth authentication flow and user session management

class SignalGPTAuth {
    constructor() {
        this.authKey = 'signalgpt_auth';
        this.currentUser = null;
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupAuthUI();
    }

    // Check if user is authenticated
    checkAuthentication() {
        const authData = localStorage.getItem(this.authKey);
        if (!authData) {
            this.redirectToLogin();
            return false;
        }

        try {
            const parsed = JSON.parse(authData);
            
            // Check if token is still valid (within 1 hour)
            if (Date.now() - parsed.timestamp > 3600000) {
                this.logout();
                return false;
            }

            // Verify token format
            if (!parsed.token || !parsed.user) {
                this.logout();
                return false;
            }

            this.currentUser = parsed.user;
            this.isAuthenticated = true;
            return true;

        } catch (error) {
            console.error('Authentication check failed:', error);
            this.logout();
            return false;
        }
    }

    // Redirect to login page
    redirectToLogin() {
        if (window.location.pathname !== '/login.html') {
            window.location.href = 'login.html';
        }
    }

    // Setup authentication UI elements
    setupAuthUI() {
        if (!this.isAuthenticated) return;

        this.addUserHeader();
        this.addLogoutButton();
        this.addBackToHomeButton();
    }

    // Add user information to header
    addUserHeader() {
        // Create auth header if it doesn't exist
        let authHeader = document.querySelector('.auth-header');
        if (!authHeader) {
            authHeader = document.createElement('div');
            authHeader.className = 'auth-header';
            authHeader.innerHTML = `
                <div class="auth-header__container">
                    <div class="auth-header__user">
                        <img class="auth-header__avatar" src="${this.currentUser.picture || ''}" alt="User Avatar">
                        <div class="auth-header__user-info">
                            <span class="auth-header__username">${this.currentUser.name || 'User'}</span>
                            <span class="auth-header__email">${this.currentUser.email || ''}</span>
                        </div>
                    </div>
                    <div class="auth-header__actions">
                        <button class="auth-header__logout" onclick="signalGPTAuth.logout()">Logout</button>
                    </div>
                </div>
            `;

            // Insert at the top of the body
            document.body.insertBefore(authHeader, document.body.firstChild);
        }

        // Add auth header styles
        this.addAuthStyles();
    }

    // Add logout button functionality
    addLogoutButton() {
        const logoutButtons = document.querySelectorAll('.auth-logout-btn');
        logoutButtons.forEach(button => {
            button.addEventListener('click', () => this.logout());
        });
    }

    // Add "Back to Home" navigation
    addBackToHomeButton() {
        const backButtons = document.querySelectorAll('.back-to-home');
        backButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'index.html';
            });
        });
    }

    // Add authentication-related styles
    addAuthStyles() {
        if (document.querySelector('#auth-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'auth-styles';
        styles.textContent = `
            .auth-header {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 10000;
                background: linear-gradient(135deg, rgba(36, 36, 36, 0.95) 0%, rgba(24, 24, 48, 0.95) 100%);
                backdrop-filter: blur(10px);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                padding: 0.75rem 0;
                transition: all 0.3s ease;
            }

            .auth-header__container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 2rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .auth-header__user {
                display: flex;
                align-items: center;
                gap: 1rem;
            }

            .auth-header__avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid rgba(255, 255, 255, 0.2);
                object-fit: cover;
            }

            .auth-header__user-info {
                display: flex;
                flex-direction: column;
                gap: 0.2rem;
            }

            .auth-header__username {
                color: white;
                font-weight: 600;
                font-size: 0.9rem;
            }

            .auth-header__email {
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.8rem;
            }

            .auth-header__logout {
                background: rgba(231, 76, 60, 0.8);
                border: none;
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.85rem;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .auth-header__logout:hover {
                background: rgba(231, 76, 60, 1);
                transform: translateY(-1px);
            }

            .back-to-home {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                background: rgba(52, 152, 219, 0.8);
                color: white;
                text-decoration: none;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.85rem;
                transition: all 0.3s ease;
                margin: 1rem 0;
            }

            .back-to-home:hover {
                background: rgba(52, 152, 219, 1);
                transform: translateY(-1px);
                color: white;
                text-decoration: none;
            }

            .auth-protected {
                padding-top: 80px; /* Account for fixed auth header */
            }

            .auth-status-indicator {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                background: rgba(46, 125, 50, 0.9);
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.8rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .auth-status-indicator::before {
                content: '🔓';
                font-size: 0.9rem;
            }

            @media (max-width: 768px) {
                .auth-header__container {
                    padding: 0 1rem;
                }
                
                .auth-header__user-info {
                    display: none;
                }
                
                .auth-header__logout {
                    padding: 0.4rem 0.8rem;
                    font-size: 0.8rem;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // Logout user
    logout() {
        localStorage.removeItem(this.authKey);
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Clear any Google sign-in state
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }
        
        window.location.href = 'login.html';
    }

    // Get current user info
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    // Refresh authentication token
    refreshAuth() {
        const authData = localStorage.getItem(this.authKey);
        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                parsed.timestamp = Date.now();
                localStorage.setItem(this.authKey, JSON.stringify(parsed));
                return true;
            } catch (error) {
                console.error('Token refresh failed:', error);
                this.logout();
                return false;
            }
        }
        return false;
    }

    // Add authentication status indicator
    addStatusIndicator() {
        if (document.querySelector('.auth-status-indicator')) return;

        const indicator = document.createElement('div');
        indicator.className = 'auth-status-indicator';
        indicator.textContent = 'Authenticated';
        document.body.appendChild(indicator);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Initialize authentication system
let signalGPTAuth;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        signalGPTAuth = new SignalGPTAuth();
    });
} else {
    signalGPTAuth = new SignalGPTAuth();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignalGPTAuth;
}