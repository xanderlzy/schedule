// Lazy Firebase bootstrap: the SDK is only downloaded when a config is present.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
let ctx;

export async function initFirebase() {
  if (ctx) return ctx;
  const [appMod, authMod, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  ctx = {
    db,
    fs,
    signIn: () => authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider()),
    signOut: () => authMod.signOut(auth),
    onAuth: (cb) => authMod.onAuthStateChanged(auth, cb),
  };
  return ctx;
}
