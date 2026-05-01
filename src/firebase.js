import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDSO4E3TZfN-5uP-15EKY3ID_RPTzFP2-Q",
  authDomain: "dt-study-hub.firebaseapp.com",
  projectId: "dt-study-hub",
  storageBucket: "dt-study-hub.firebasestorage.app",
  messagingSenderId: "182982760604",
  appId: "1:182982760604:web:6eec051d6c7583f2cf7559",
  measurementId: "G-2S3CFQF08J",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
