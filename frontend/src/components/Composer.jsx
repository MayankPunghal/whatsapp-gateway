import { useState } from "react";
import { apiPost, fileToBase64, dedupeNumbers } from "../api";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function Composer({ sessionId, disabled, onLog }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [delay, setDelay] = useState("1500");
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
    const numbers = dedupeNumbers(to.split(/[\s,]+/));
    if (numbers.length === 0) { alert("Enter at least one recipient phone"); return; }
    const delayMs = parseInt(delay, 10);
    if (isNaN(delayMs) || delayMs < 0) { alert("Invalid delay"); return; }

    try {
      setBusy(true);
      for (const num of numbers) {
        if (files.length === 0 && !showLocation) {
          const r = await apiPost(`/api/sessions/${sessionId}/sendText`, { to: num, message: text });
          if (!r.ok) throw new Error(r.error || "sendText failed");
          onLog?.(`[send-text] ok -> ${num}`);
        } else {
          if (files.length > 0) {
            const items = files.map(f => ({
              data: f.b64,
              mimetype: f.mime,
              filename: f.name,
              caption: text || undefined
            }));
            const r = await apiPost(`/api/sessions/${sessionId}/sendMedia`, { to: num, items });
            if (!r.ok) throw new Error(r.error || "sendMedia failed");
            onLog?.(`[send-media] ${items.length} file(s) -> ${num}`);
          }
          if (showLocation) {
            const latNum = parseFloat(lat), lngNum = parseFloat(lng);
            if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
              const r = await apiPost(`/api/sessions/${sessionId}/sendLocation`, { to: num, lat: latNum, lng: lngNum, description: desc || "" });
              if (!r.ok) throw new Error(r.error || "sendLocation failed");
              onLog?.(`[send-location] (${latNum}, ${lngNum}) -> ${num}`);
            } else {
              alert("Invalid latitude/longitude");
            }
          }
        }
        if (numbers.length > 1 && delayMs > 0) await sleep(delayMs);
      }
      // Clear fields after successful broadcast to all
      setTo("");
      setText("");
      setFiles([]);
      setLat(""); setLng(""); setDesc(""); setShowLocation(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      <div className="row" style={{gap:8, alignItems:"flex-start"}}>
        <div style={{display:"flex", flexDirection:"column", flex:1}}>
        <textarea className="textarea to-input" rows={2} placeholder="recipient phones (one per line or comma-separated)"
                  value={to} onChange={e=>setTo(e.target.value)} />
          <input className="input-inline delay-input" placeholder="delay (ms)" value={delay} onChange={e=>setDelay(e.target.value)} />
        </div>
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