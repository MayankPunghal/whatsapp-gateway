import { useEffect, useState } from "react";
import { apiPost, dedupeNumbers, fileToBase64 } from "../api";

export default function BroadcastDrawer({ sessionId, open, onClose, onLog }) {
  const [raw, setRaw] = useState("");
  const [numbers, setNumbers] = useState([]);
  const [msg, setMsg] = useState("");
  const [delay, setDelay] = useState(2000);

  const [mediaFile, setMediaFile] = useState(null); // {name,mime,b64}
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setRaw(""); setNumbers([]); setMsg(""); setDelay(2000); setMediaFile(null); setMediaUrl(""); setCaption(""); }
  }, [open]);

  const parseNumbers = () => {
    const parts = raw.split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
    setNumbers(dedupeNumbers(parts));
  };

  const onCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRaw(prev => (prev ? prev + "\n" : "") + text);
    e.target.value = "";
  };

  const onPickMedia = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMediaUrl("");
    setMediaFile({ name: f.name, mime: f.type || "application/octet-stream", b64: await fileToBase64(f) });
    e.target.value = "";
  };

  const broadcast = async () => {
    if (busy) return;
    if (numbers.length === 0) { alert("Add at least one number"); return; }
    if (!msg && !mediaFile && !mediaUrl) { alert("Provide a message or a media"); return; }

    try {
      setBusy(true);
      if (mediaFile || mediaUrl) {
        const item = mediaFile
          ? { data: mediaFile.b64, mimetype: mediaFile.mime, filename: mediaFile.name, caption: caption || undefined }
          : { url: mediaUrl, caption: caption || undefined };
        const r = await apiPost(`/api/sessions/${sessionId}/broadcastMedia`, { numbers, item, delayMs: Number(delay)||2000 });
        if (!r.ok) throw new Error(r.error || "broadcastMedia failed");
        onLog?.(`[broadcast-media] ${r.count} recipients`);
      }
      if (msg) {
        const r2 = await apiPost(`/api/sessions/${sessionId}/broadcastText`, { numbers, message: msg, delayMs: Number(delay)||2000 });
        if (!r2.ok) throw new Error(r2.error || "broadcastText failed");
        onLog?.(`[broadcast-text] ${r2.count} recipients`);
      }
      onClose?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`drawer ${open ? "open" : ""}`}>
      <div className="drawer-panel">
        <div className="drawer-header">
          <div style={{fontWeight:700}}>Broadcast</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="drawer-body">
          <div className="section">
            <div className="label">Recipients</div>
            <div className="small">Upload CSV (single column or comma/newline separated), or paste numbers below.</div>
            <div className="row" style={{gap:8, marginTop:8}}>
              <label className="btn">
                Upload CSV
                <input type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={onCsv} />
              </label>
              <button className="btn" onClick={parseNumbers}>Parse</button>
              <div className="badge">Total: {numbers.length}</div>
            </div>
            <textarea className="input" rows={6} placeholder="Paste numbers here (comma/newline separated)"
                      value={raw} onChange={e=>setRaw(e.target.value)} />
            {numbers.length>0 && (
              <div className="chips">
                {numbers.map((n,i)=> <div key={i} className="chip"><div className="chip-name">{n}</div></div>)}
              </div>
            )}
          </div>

          <div className="section">
            <div className="label">Message (optional)</div>
            <textarea className="input" rows={3} placeholder="Text (emojis/links supported)" value={msg} onChange={e=>setMsg(e.target.value)} />
          </div>

          <div className="section">
            <div className="label">Media (optional)</div>
            <div className="row" style={{gap:8}}>
              <label className="btn">
                Pick file
                <input type="file" style={{display:"none"}} onChange={onPickMedia}/>
              </label>
              <input className="input-inline" placeholder="or media URL (https://...)" value={mediaUrl} onChange={e=>{setMediaUrl(e.target.value); setMediaFile(null);}} />
              <input className="input-inline" placeholder="caption (optional)" value={caption} onChange={e=>setCaption(e.target.value)} />
            </div>
            {mediaFile && <div className="small" style={{marginTop:6}}>Selected: {mediaFile.name} ({mediaFile.mime})</div>}
          </div>

          <div className="section">
            <div className="label">Throttle</div>
            <div className="row" style={{gap:8}}>
              <input className="input-inline" style={{maxWidth:160}} placeholder="delay ms (e.g., 2000)" value={delay} onChange={e=>setDelay(e.target.value)} />
              <div className="small">Keep 1500–3000ms to avoid rate-limits</div>
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          <button className="btn send" onClick={broadcast} disabled={busy}>Send Broadcast</button>
        </div>
      </div>
    </div>
  );
}
