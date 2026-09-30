/* Ashes of Midgard: optional cloud login (js/auth.js). See docs/AUTH-SETUP.md.
   Leave `firebase: null` and the game stays guest-only: the Sign in button then only says that cloud login is not set
   up yet. To turn it on, paste the web app config from the Firebase console (Project settings > Your apps > SDK setup
   and configuration > Config) in place of null, for example:
     firebase: {
       apiKey: 'AIza...',
       authDomain: 'your-project.firebaseapp.com',
       projectId: 'your-project',
       storageBucket: 'your-project.firebasestorage.app',
       messagingSenderId: '1234567890',
       appId: '1:1234567890:web:abc123'
     },
   These values are not secrets: every web app ships them to the browser. Access is protected by firestore.rules and
   by the authorized domains list in Firebase Authentication.
   `providers` sets which sign-in buttons show, in this order. Remove any you have not enabled in Firebase.
   Known ids: google, facebook, twitter (X), github, microsoft, apple, email (magic link). */
window.AOM_AUTH = Object.assign({
  firebase: null /* user pastes web config here */,
  providers: ['google', 'facebook', 'twitter', 'github', 'microsoft', 'apple', 'email']
}, window.AOM_AUTH || {});
