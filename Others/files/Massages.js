import { db } from "./firebase.js";
import { collection, getDocs, query, where, orderBy, updateDoc, deleteDoc, doc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================= GLOBAL STATE ================= */
let ADMIN_ROLE="", ADMIN_EMAIL="", allRows=[], logRows=[], pending=0, contacted=0;

/* ================= LOGIN ================= */
async function login(){
  const email = adminEmail.value.trim(), pass = adminPass.value.trim();
  if(!email || !pass){ showAlert1("⚠️ Enter email & password"); return; }

  try{
    const q = query(collection(db,"admins"), where("email","==",email), where("password","==",pass), where("active","==",true));
    const snap = await getDocs(q);
    if(snap.empty){ showAlert1("❌ Invalid login"); return; }
    const admin = snap.docs[0].data();
    ADMIN_ROLE = admin.role || "viewer"; ADMIN_EMAIL = admin.email;
    sessionStorage.setItem("admin","logged"); sessionStorage.setItem("role",ADMIN_ROLE); sessionStorage.setItem("email",ADMIN_EMAIL);
    await logActivity("LOGIN"); showDashboard();
  } catch(err){ console.error(err); showAlert1("❌ Login failed"); }
}

/* ================= SESSION ================= */
function showDashboard(){
  loginCard.style.display="none"; dashboard.style.display="block"; roleLabel.textContent=ADMIN_ROLE.toUpperCase();
  applyRoleUI(); renderLeads(); renderActivityLogs();
}
function logout(){ logActivity("LOGOUT"); sessionStorage.clear(); location.reload(); }
if(sessionStorage.getItem("admin")==="logged"){ ADMIN_ROLE=sessionStorage.getItem("role"); ADMIN_EMAIL=sessionStorage.getItem("email"); showDashboard(); }

/* ================= ROLE UI ================= */
function applyRoleUI(){
  document.querySelector("button[onclick='exportCSV()']")?.style.setProperty("display",ADMIN_ROLE==="super"?"inline-block":"none");
  document.querySelector("button[onclick='exportLogsCSV()']")?.style.setProperty("display",ADMIN_ROLE==="super"?"inline-block":"none");
  const logsCard = document.getElementById("activityLogsCard"); if(logsCard) logsCard.style.display=ADMIN_ROLE==="super"?"block":"none";
}

/* ================= LEADS ================= */
async function renderLeads(){
  loader.style.display="block"; const tbody=document.querySelector("#leadsTable tbody"); tbody.innerHTML=""; allRows=[]; pending=0; contacted=0;
  try{
    const snap = await getDocs(query(collection(db,"leads"),orderBy("createdAt","desc")));
    leadCount.textContent=snap.size; totalCount.textContent=snap.size;
    snap.forEach(d=>{
      const l=d.data(); const status=l.status||"pending"; status==="pending"?pending++:contacted++;
      let actionBtn="-"; if(ADMIN_ROLE==="editor"||ADMIN_ROLE==="super"){ actionBtn=`<button class="action-btn" onclick="toggleStatus('${d.id}','${status}')">Mark ${status==="pending"?"Contacted":"Pending"}</button>`; }
      let createdAtStr=""; if(l.createdAt && typeof l.createdAt.toDate==="function") createdAtStr=l.createdAt.toDate().toLocaleString();
      const tr=document.createElement("tr"); tr.innerHTML=`<td>${l.name||""}</td><td>${l.email||""}</td><td>${l.service||""}</td><td>${l.message||"-"}</td><td><span class="status ${status}">${status.toUpperCase()}</span></td><td>${actionBtn}</td><td>${createdAtStr}</td>`;
      allRows.push(tr); tbody.appendChild(tr);
    });
    pendingCount.textContent=pending; contactedCount.textContent=contacted;
  }catch(err){ console.error(err); showAlert1("❌ Failed to load leads"); } finally{ loader.style.display="none"; }
}

/* ================= STATUS ================= */
async function toggleStatus(id,current){ if(ADMIN_ROLE==="viewer") return; const next=current==="pending"?"contacted":"pending"; await updateDoc(doc(db,"leads",id),{status:next}); await logActivity("STATUS_CHANGED",{leadId:id,from:current,to:next}); renderLeads(); }

/* ================= EXPORT ================= */
async function exportCSV(){
  if(ADMIN_ROLE!=="super") return;
  try{
    const snap=await getDocs(query(collection(db,"leads"),orderBy("createdAt","desc"))); if(snap.empty) return;
    let csv="Name,Email,Service,Message,Status,Date\n";
    snap.forEach(d=>{ const l=d.data(); csv+=`"${l.name}","${l.email}","${l.service}","${l.message||""}","${l.status||"pending"}","${l.createdAt?.toDate().toISOString()}"\n`; });
    downloadCSV(csv,"leads.csv");
  }catch(err){ console.error(err); showAlert1("❌ Failed to export leads"); }
}

/* ================= ACTIVITY LOGS ================= */
async function renderActivityLogs(){
  if(ADMIN_ROLE!=="super") return;
  const tbody=document.querySelector("#logsTable tbody"); tbody.innerHTML=""; logRows=[];
  try{
    const snap=await getDocs(query(collection(db,"activity_logs"),orderBy("createdAt","desc")));
    if(snap.empty){ tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:#888">No activity logs</td></tr>`; return; }
    snap.forEach(d=>{
      const log=d.data();
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${log.adminEmail||"-"}</td><td>${log.role||"-"}</td><td>${log.action||"-"}</td><td>${log.leadId||"-"}</td><td>${log.from||"-"}</td><td>${log.to||"-"}</td><td>${log.createdAt?.toDate?.().toLocaleString()||"-"}</td><td><button class="danger-btn" onclick="deleteLog('${d.id}')">🗑</button></td>`;
      if(log.leadId){ tr.style.cursor="pointer"; tr.onclick=e=>{ if(!e.target.closest("button")) openLeadDetails(log.leadId); } }
      logRows.push(tr); tbody.appendChild(tr);
    });
  }catch(err){ console.error(err); tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:red">Failed to load activity logs</td></tr>`; }
}

/* ================= DELETE LOG ================= */
async function deleteLog(id){ if(ADMIN_ROLE!=="super") return; if(!confirm("Delete this activity log?")) return;
  try{ await deleteDoc(doc(db,"activity_logs",id)); await logActivity("DELETE_LOG",{deletedLogId:id}); renderActivityLogs(); }catch(err){ console.error(err); showAlert1("❌ Failed to delete log"); } 
}

/* ================= FILTER LOGS ================= */
function filterLogs(){
  const q=logSearch?.value?.toLowerCase()||""; const start=startDate?.value?new Date(startDate.value):null; const end=endDate?.value?new Date(endDate.value):null;
  logRows.forEach(r=>{
    const textMatch=r.textContent.toLowerCase().includes(q);
    let dateMatch=true;
    const timeCell=r.children[6]?.textContent||"";
    if(timeCell && (start||end)){
      const logDate=new Date(timeCell);
      if(start && logDate<start) dateMatch=false;
      if(end && logDate>end) dateMatch=false;
    }
    r.style.display=textMatch && dateMatch?"":"none";
  });
}

/* ================= LEAD DETAILS ================= */
async function openLeadDetails(id){ leadDetailBox.classList.add("show"); leadDetailContent.innerHTML="Loading...";
  try{ const snap=await getDocs(query(collection(db,"leads"),where("__name__","==",id))); if(snap.empty){ leadDetailContent.innerHTML="Lead not found"; return; }
    const l=snap.docs[0].data(); leadDetailContent.innerHTML=`<strong>Name:</strong> ${l.name}<br><strong>Email:</strong> ${l.email}<br><strong>Service:</strong> ${l.service}<br><strong>Status:</strong> ${(l.status||"pending").toUpperCase()}<br><strong>Message:</strong><br>${l.message||"-"}`; 
  }catch(err){ console.error(err); leadDetailContent.innerHTML="Failed to load lead"; } 
}
function closeLeadDetails(){ leadDetailBox.classList.remove("show"); }

/* ================= LOG ACTIVITY ================= */
async function logActivity(action,data={}){ try{ await addDoc(collection(db,"activity_logs"),{adminEmail:ADMIN_EMAIL,role:ADMIN_ROLE,action,...data,createdAt:serverTimestamp()}); }catch(err){ console.error(err);} }

/* ================= UTIL ================= */
function downloadCSV(text,name){ const blob=new Blob([text],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); }

/* ================= TOAST ================= */
function showToast(msg,duration=3500){ const container=document.getElementById("toastContainer")||createToastContainer(); const toast=document.createElement("div"); toast.textContent=msg; toast.style.cssText=`background:#222;color:#fff;padding:10px 16px;border-radius:10px;margin-top:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);opacity:0;transform:translateY(-20px);transition:opacity .3s, transform .3s`; container.appendChild(toast); requestAnimationFrame(()=>{ toast.style.opacity=1; toast.style.transform="translateY(0)"; }); setTimeout(()=>{ toast.style.opacity=0; toast.style.transform="translateY(-20px)"; setTimeout(()=>toast.remove(),300); },duration); }
function createToastContainer(){ const c=document.createElement("div"); c.id="toastContainer"; c.style.cssText="position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;"; document.body.appendChild(c); return c; }
function showAlert1(msg){ showToast(msg); }
function closeAlert1(){ alertBox1.classList.remove("show"); }

/* ================= CLICK OUTSIDE ================= */
document.getElementById("alertBox1")?.addEventListener("click",e=>{ if(e.target.id==="alertBox1") closeAlert1(); });
document.getElementById("leadDetailBox")?.addEventListener("click",e=>{ if(e.target.id==="leadDetailBox") closeLeadDetails(); });

/* ================= EXPOSE ================= */
window.login=login; window.logout=logout; window.exportCSV=exportCSV; window.toggleStatus=toggleStatus;
window.deleteLog=deleteLog; window.filterLogs=filterLogs; window.openLeadDetails=openLeadDetails;
window.closeLeadDetails=closeLeadDetails; window.showAlert1=showAlert1; window.closeAlert1=closeAlert1;

console.log("✅ ADMIN PANEL FULLY FIXED & STABLE");
