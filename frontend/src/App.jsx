import { useState } from "react";
import SessionList from "./components/SessionList";
import SessionPanel from "./components/SessionPanel";
import "./styles.css";

export default function App() {
  const [selected, setSelected] = useState(null);
  return (
    <div className="app">
      <SessionList selected={selected} onSelect={setSelected} onCreated={setSelected} />
      {selected ? <SessionPanel id={selected} /> : <div className="main"><div className="card">Select or add a session to begin.</div></div>}
    </div>
  );
}
