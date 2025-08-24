import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";

export default function SessionList({ selected, onSelect, onCreated }) {
  const [sessions, setSessions] = useState([]);
  const [newId, setNewId] = useState("");

  const refresh = async () => {
    const data = await apiGet("/api/health");
    setSessions(data.sessions || []);
  };

  const add = async () => {
    const id = newId.trim();
    if (!id) return;
    const r = await apiPost("/api/sessions", { id });
    if (r.ok) {
      setNewId("");
      await refresh();
      onCreated?.(id);
    } else {
      alert(r.error || "Failed");
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div className="sidebar">
      <div className="header">
        <div style={{fontWeight:600}}>Sessions</div>
        <button className="btn small" onClick={refresh}>Refresh</button>
      </div>

      <div className="row">
        <input className="input" placeholder="new-session-id" value={newId} onChange={e=>setNewId(e.target.value)} />
        <button className="btn" onClick={add}>Add Session</button>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:8, marginTop:8}}>
        {sessions.map(s => (
          <div key={s.id}
            className={`session-item ${selected===s.id ? "active":""}`}
            onClick={()=>onSelect(s.id)}>
            <div style={{display:"flex", justifyContent:"space-between"}}>
              <div>{s.id}</div>
              <div className="small">{s.status}</div>
            </div>
          </div>
        ))}
        {sessions.length===0 && <div className="small">No sessions yet.</div>}
      </div>
    </div>
  );
}
