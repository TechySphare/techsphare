// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA2_hXoUM2Y3Pi_gBi_nUYP_yw3efV6S3k",
  authDomain: "techysphare08.firebaseapp.com",
  projectId: "techysphare08",
  storageBucket: "techysphare08.appspot.com",
  messagingSenderId: "405009528840",
  appId: "1:405009528840:web:2a1dbaeae73cc66370b9bd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
