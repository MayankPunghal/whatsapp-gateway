import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { apiPost, apiDelete, backendBase } from "../api";
import Composer from "./Composer";
import BroadcastDrawer from "./BroadcastDrawer";

const statusColor = (s) =>
  s === "ready" ? "dot-ready" : s === "qr" ? "dot-qr" : "dot-down";

export default function SessionPanel({ id }) {
  const [status, setStatus] = useState("down");
  const [qr, setQr] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsRef = useRef(null);
  const [openBroadcast, setOpenBroadcast] = useState(false);

  const appendLog = (line) => setLogs((prev) => [...prev.slice(-500), `${new Date().toLocaleTimeString()} ${line}`]);

  useEffect(() => {
    if (!id) return;
    const socket = io(backendBase(), { transports: ["websocket"] });
    socket.on("connect", () => { socket.emit("join", { id }); appendLog("[socket] connected"); });
    socket.on("qr", ({ qr: b64 }) => { setQr(`data:image/png;base64,${b64}`); setStatus("qr"); appendLog("[qr] received"); });
    socket.on("status", ({ status }) => { setStatus(status); if (status !== "qr") setQr(null); appendLog(`[status] ${status}`); });
    socket.on("log", ({ line }) => appendLog(line));
    return () => socket.close();
  }, [id]);

  useEffect(() => {
    const el = logsRef.current; if (!el) return; el.scrollTop = el.scrollHeight;
  }, [logs]);

  const onStart = async () => { const r = await apiPost(`/api/sessions/${id}/start`); if (!r.ok) alert(r.error || "Start failed"); };
  const onLogout = async () => { const r = await apiPost(`/api/sessions/${id}/logout`); if (!r.ok) alert(r.error || "Logout failed"); };
  const onDelete = async () => {
    if (!confirm(`Delete session data for "${id}"?`)) return;
    const r = await apiDelete(`/api/sessions/${id}`); if (!r.ok) alert(r.error || "Delete failed"); else window.location.reload();
  };

  return (
    <div className="main">
      <div className="card">
        <div className="row" style={{justifyContent:"space-between"}}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span className={`status-dot ${statusColor(status)}`}></span>
            <div style={{fontWeight:600, fontSize:18}}>{id}</div>
            <span className="badge">Status: {status}</span>
          </div>
          <div className="row">
            <button className="btn" onClick={onStart}>Start</button>
            <button className="btn" onClick={onLogout}>Logout</button>
            <button className="btn" onClick={onDelete}>Delete</button>
            <button className="btn" onClick={()=>setOpenBroadcast(true)}>Broadcast</button>
          </div>
        </div>
      </div>

      {status === "qr" && qr && (
        <div className="card">
          <div className="row" style={{alignItems:"center", gap:16}}>
            <img className="qr" src={qr} alt="Scan QR" />
            <div>
              <div style={{fontWeight:600, marginBottom:8}}>Scan QR with WhatsApp</div>
              <div className="small">WhatsApp &gt; Linked devices &gt; Link a device</div>
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="card">
        <div style={{fontWeight:600, marginBottom:8}}>Compose</div>
        <Composer sessionId={id} disabled={status!=="ready"} onLog={(m)=>appendLog(m)} />
      </div>

      {/* Logs */}
      <div className="card">
        <div style={{fontWeight:600, marginBottom:8}}>Live Logs</div>
        <div ref={logsRef} className="logs">
          {logs.map((l,i)=> <div key={i}>{l}</div>)}
        </div>
      </div>

      <BroadcastDrawer
        sessionId={id}
        open={openBroadcast}
        onClose={()=>setOpenBroadcast(false)}
        onLog={(m)=>appendLog(m)}
      />
    </div>
  );
}