import { useState } from "react";
import { apiPost, fileToBase64 } from "../api";

export default function Composer({ sessionId, disabled, onLog }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [showLocation, setShowLocation] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [desc, setDesc] = useState("");

  const [files, setFiles] = useState([]); // [{file, name, mime, b64}]
  const [busy, setBusy] = useState(false);

  const pickFiles = async (e) => {
    const list = Array.from(e.target.files || []);
    const mapped = await Promise.all(list.map(async f => ({
      file: f,
      name: f.name,
      mime: f.type || "application/octet-stream",
      b64: await fileToBase64(f)
    })));
    setFiles(prev => [...prev, ...mapped]);
    e.target.value = ""; // reset
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const send = async () => {
    if (disabled || busy) return;
    if (!to.trim()) { alert("Enter a recipient phone"); return; }

    try {
      setBusy(true);
      if (files.length === 0 && !showLocation) {
        const r = await apiPost(`/api/sessions/${sessionId}/sendText`, { to, message: text });
        if (!r.ok) throw new Error(r.error || "sendText failed");
        onLog?.(`[send-text] ok -> ${to}`);
        setText("");
        return;
      }

      if (files.length > 0) {
        const items = files.map(f => ({
          data: f.b64,
          mimetype: f.mime,
          filename: f.name,
          caption: text || undefined
        }));
        const r = await apiPost(`/api/sessions/${sessionId}/sendMedia`, { to, items });
        if (!r.ok) throw new Error(r.error || "sendMedia failed");
        onLog?.(`[send-media] ${items.length} file(s) -> ${to}`);
        setFiles([]); // keep text
      }

      if (showLocation) {
        const latNum = parseFloat(lat), lngNum = parseFloat(lng);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          const r = await apiPost(`/api/sessions/${sessionId}/sendLocation`, { to, lat: latNum, lng: lngNum, description: desc || "" });
          if (!r.ok) throw new Error(r.error || "sendLocation failed");
          onLog?.(`[send-location] (${latNum}, ${lngNum}) -> ${to}`);
          setLat(""); setLng(""); setDesc(""); setShowLocation(false);
        } else {
          alert("Invalid latitude/longitude");
        }
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      <div className="row" style={{gap:8, alignItems:"flex-start"}}>
        <input className="input-inline to-input" placeholder="recipient phone (e.g., 91999...)"
               value={to} onChange={e=>setTo(e.target.value)} />
        <textarea className="textarea" rows={3} placeholder="Type a message (supports emojis, *bold*, _italic_, links)"
                  value={text} onChange={e=>setText(e.target.value)} />
        <div className="composer-actions">
          <label className="btn attach">
            Attach
            <input type="file" multiple style={{display:"none"}} onChange={pickFiles}/>
          </label>
          <button className="btn" onClick={()=>setShowLocation(v=>!v)}>{showLocation ? "Hide Location" : "Location"}</button>
          <button className="btn send" disabled={disabled || busy} onClick={send}>Send</button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="attachments">
          {files.map((f, i) => (
            <div key={i} className="chip">
              <div className="chip-name" title={f.name}>{f.name}</div>
              <button className="chip-x" onClick={()=>removeFile(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      {showLocation && (
        <div className="location-box">
          <input className="input-inline" placeholder="latitude (e.g., 28.5355)" value={lat} onChange={e=>setLat(e.target.value)} />
          <input className="input-inline" placeholder="longitude (e.g., 77.3910)" value={lng} onChange={e=>setLng(e.target.value)} />
          <input className="input-inline" placeholder="description (optional)" value={desc} onChange={e=>setDesc(e.target.value)} />
        </div>
      )}
    </div>
  );
}