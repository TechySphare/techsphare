import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================= INIT ================= */
const YEAR = new Date().getFullYear();
document.getElementById('year').textContent = YEAR;
const CHAT_KEY = 'bf_chat_v2';

/* ================= VISITOR TRACKING ================= */
async function initVisitorDocs() {
  try {
    // Total visitors document
    const visitorsDoc = doc(db, 'analytics', 'visitors');
    const snap = await getDoc(visitorsDoc);
    if (!snap.exists()) await setDoc(visitorsDoc, { total: 0 });

    // Daily visitors document in subcollection
    const dailyCol = collection(db, 'analytics', 'visitors', 'daily');
    const today = new Date().toISOString().slice(0, 10);
    const dailyDoc = doc(dailyCol, today);
    const dailySnap = await getDoc(dailyDoc);
    if (!dailySnap.exists()) await setDoc(dailyDoc, { count: 0 });

  } catch (e) {
    console.error('Failed to init visitor docs', e);
  }
}

async function trackVisitor() {
  try {
    // Skip counting on admin page
    if (location.pathname.includes('admin')) return;

    const today = new Date().toISOString().slice(0, 10);
    const visitKey = 'visited_' + today;
    if (localStorage.getItem(visitKey)) return;
    localStorage.setItem(visitKey, '1');

    // Update total visitors
    const visitorsDoc = doc(db, 'analytics', 'visitors');
    const visitorsSnap = await getDoc(visitorsDoc);
    const total = visitorsSnap.exists() ? visitorsSnap.data().total || 0 : 0;

    // Update daily visitors
    const dailyCol = collection(db, 'analytics', 'visitors', 'daily');
    const dailyDoc = doc(dailyCol, today);
    const dailySnap = await getDoc(dailyDoc);
    const dailyCount = dailySnap.exists() ? dailySnap.data().count || 0 : 0;

    await setDoc(visitorsDoc, { total: total + 1 }, { merge: true });
    await setDoc(dailyDoc, { count: dailyCount + 1 }, { merge: true });

    console.log('✅ Visitor counted:', total + 1);

  } catch (err) {
    console.error('❌ Visitor error:', err);
  }
}

// Initialize visitor docs and track
initVisitorDocs().then(trackVisitor);

/* ================= LEADS ================= */
async function submitLead(e) {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const service = document.getElementById('service').value;
  const message = document.getElementById('message').value.trim();

  if (!name || !email) return showAlert("❌ Name and contact required");

  try {
    await addDoc(collection(db, "leads"), {
      name, email, service, message,
      status: "new",
      createdAt: serverTimestamp()
    });
    showAlert("Message sent successfully ✅");
    e.target.reset();
  } catch (err) {
    console.error("Firebase Error:", err);
    showAlert("❌ Failed to send message");
  }
}

function saveDraft() { showAlert('Draft saved ✅'); }

/* ================= CHAT ================= */
function loadChat() { 
  try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } 
  catch { return []; } 
}

function saveChat(c) { localStorage.setItem(CHAT_KEY, JSON.stringify(c)); }

function renderChat() {
  const logEl = document.getElementById('chatLog');
  logEl.innerHTML = '';
  loadChat().forEach(msg => {
    const d = document.createElement('div');
    d.className = 'msg ' + (msg.from === 'me' ? 'from-me' : 'from-them');
    d.textContent = msg.text;
    logEl.appendChild(d);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

function toggleChat() {
  const panel = document.getElementById('chatPanel');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function openChat() { document.getElementById('chatPanel').style.display = 'flex'; }

function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  const chat = loadChat();
  chat.push({ from: 'me', text: msg, ts: Date.now() });
  saveChat(chat);
  input.value = '';
  renderChat();

  setTimeout(() => {
    chat.push({ from: 'them', text: getBotResponse(msg), ts: Date.now() });
    saveChat(chat);
    renderChat();
  }, 800);
}

/* ================= BOT ================= */
function getBotResponse(msg) {
  msg = msg.toLowerCase();
  if (msg.includes("price")) return "Prices start from ₹4,000 depending on service.";
  if (msg.includes("time")) return "Websites take 3–7 days, full projects 2–4 weeks.";
  if (msg.includes("contact")) return "Email us at techysphare@gmail.com";
  return "I'm here to help 🙂";
}

/* ================= ANIMATIONS ================= */
window.addEventListener('load', () => setTimeout(() => document.getElementById('hero')?.classList.add('show'), 300));

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('show');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll('.hero,.services,#portfolio,.contact').forEach(el => observer.observe(el));

/* ================= ALERT ================= */
function showAlert(msg) {
  document.getElementById('alertMessage').textContent = msg;
  document.getElementById('alertBox').classList.add('show');
}

function closeAlert() { document.getElementById('alertBox').classList.remove('show'); }

/* ================= EXPOSE ================= */
window.submitLead = submitLead;
window.saveDraft = saveDraft;
window.toggleChat = toggleChat;
window.openChat = openChat;
window.sendChat = sendChat;
