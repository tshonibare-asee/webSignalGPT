# SignalGPT Authentication Setup

## Google OAuth Configuration

To enable Google OAuth authentication, you need to configure a Google OAuth client ID:

### 1. Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" and create a new "OAuth 2.0 Client ID"
5. Set the application type to "Web application"
6. Add your domain to "Authorized JavaScript origins" (e.g., `http://localhost:8080` for development)
7. Add your redirect URI to "Authorized redirect URIs" (e.g., `http://localhost:8080/login.html`)

### 2. Configure the Client ID

Replace `YOUR_GOOGLE_CLIENT_ID` in the following files with your actual Google OAuth client ID:

- `public/login.html` (line ~75)
- `html/login.html` (line ~75)

```javascript
// Replace this line:
data-client_id="YOUR_GOOGLE_CLIENT_ID"

// With:
data-client_id="your-actual-client-id.googleusercontent.com"
```

Also update the JavaScript constant:

```javascript
// Replace this line:
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';

// With:
const GOOGLE_CLIENT_ID = 'your-actual-client-id.googleusercontent.com';
```

### 3. Build and Deploy

After configuring the client ID:

1. Run `npm run build` to rebuild the application
2. Serve the `public/` directory with a web server
3. Access the application - you'll be prompted to authenticate with Google

## Authentication Flow

1. **Unauthenticated Access**: Users accessing `index.html` without authentication are automatically redirected to `login.html`
2. **Google Login**: Users must authenticate with their Google account
3. **Session Management**: Authentication tokens are stored locally and expire after 1 hour
4. **Protected Access**: Authenticated users can access all SignalGPT features
5. **Logout**: Users can logout, which clears the session and redirects to login

## Development

For development, you can simulate authentication by setting fake auth data in localStorage:

```javascript
localStorage.setItem('signalgpt_auth', JSON.stringify({
    token: 'fake_token',
    user: {
        id: '123',
        name: 'Test User',
        email: 'test@example.com',
        picture: 'https://via.placeholder.com/40'
    },
    timestamp: Date.now()
}));
```

Then refresh the page to access the application without real Google authentication.