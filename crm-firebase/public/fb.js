// Capa de datos: todo el acceso a Firebase pasa por aquí.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, query,
  orderBy, limit, where, addDoc, setDoc, updateDoc, deleteDoc, getDoc, runTransaction, increment, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig, REGION } from "./firebase-config.js";

const configured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PEGA");
let auth, db, fns;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Copia local en el dispositivo: abre rápido y funciona sin señal
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  fns = getFunctions(app, REGION);
}

export const fb = {
  configured,
  onUser: cb => onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)),
  login: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
  logout: () => signOut(auth),
  resetPassword: email => sendPasswordResetEmail(auth, email),
  watch(path, cb, opts = {}, onErr) {
    const c = [];
    (opts.where || []).forEach(w => c.push(where(...w)));
    if (opts.orderBy) c.push(orderBy(...opts.orderBy));
    if (opts.limit) c.push(limit(opts.limit));
    const q = c.length ? query(collection(db, path), ...c) : collection(db, path);
    return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
  },
  watchDoc: (path, cb, onErr) => onSnapshot(doc(db, path), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), onErr),
  get: async path => { const d = await getDoc(doc(db, path)); return d.exists() ? { id: d.id, ...d.data() } : null; },
  add: async (path, data) => (await addDoc(collection(db, path), data)).id,
  newId: path => doc(collection(db, path)).id,
  set: (path, data, merge = true) => setDoc(doc(db, path), data, { merge }),
  update: (path, data) => updateDoc(doc(db, path), data),
  remove: path => deleteDoc(doc(db, path)),
  inc: n => increment(n),
  async batch(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach(o => o.op === "delete" ? b.delete(doc(db, o.path)) : b.set(doc(db, o.path), o.data, { merge: !!o.merge }));
      await b.commit();
    }
  },
  nextNumber: name => runTransaction(db, async t => {
    const r = doc(db, "counters/" + name), s = await t.get(r);
    const n = (s.exists() ? s.data().n : 0) + 1;
    t.set(r, { n });
    return n;
  }),
  call: (name, data) => httpsCallable(fns, name)(data).then(r => r.data),
};
