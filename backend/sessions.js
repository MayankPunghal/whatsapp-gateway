// sessions.js
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia, Location } = pkg;
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import EventEmitter from "events";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SessionManager extends EventEmitter {
  constructor({ sessionsDir = "/app/sessions", chromiumPath = "/usr/bin/chromium", chromiumFlags = "" }) {
    super();
    this.sessions = new Map(); // id -> { client, status }
    this.sessionsDir = sessionsDir;
    this.chromiumPath = chromiumPath;
    this.chromiumFlags = chromiumFlags.split(" ").filter(Boolean);
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  list() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({ id, status: s.status }));
  }
  has(id) { return this.sessions.has(id); }
  ensureRecord(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, { client: null, status: "down" });
    return this.sessions.get(id);
  }
  sessionPath(id) { return path.join(this.sessionsDir, id); }
  normalizeJid(to) { return to.includes("@") ? to : `${to.replace(/\D/g, "")}@c.us`; }

  async create(id) {
    if (!id || typeof id !== "string") throw new Error("Session id is required");
    this.ensureRecord(id);
    return { id };
  }
  async delete(id) {
    const rec = this.ensureRecord(id);
    if (rec.client) { try { await rec.client.destroy(); } catch {} rec.client = null; }
    rec.status = "down";
    const dir = this.sessionPath(id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return { id, deleted: true };
  }
  async logout(id) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    await rec.client.logout();
    rec.status = "disconnected";
    this.emit("status", { id, status: "disconnected" });
    return { id, status: rec.status };
  }

  async start(io, id) {
    const rec = this.ensureRecord(id);
    if (rec.client) {
      try { await rec.client.initialize(); return { id, status: rec.status }; }
      catch (_) { try { await rec.client.destroy(); } catch {} }
    }

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionsDir, clientId: id }),
      puppeteer: {
        headless: true,
        executablePath: this.chromiumPath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", ...this.chromiumFlags]
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 30000,
      qrMaxRetries: 0
    });

    rec.client = client;
    rec.status = "initializing";
    this.emit("status", { id, status: "initializing" });

    const emitToSession = (event, payload) => io.to(id).emit(event, { id, ...payload });

    client.on("qr", async (qr) => {
      rec.status = "qr"; this.emit("status", { id, status: "qr" });
      const dataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: "M", margin: 1, width: 300 });
      const base64 = dataUrl.split(",")[1];
      emitToSession("qr", { qr: base64 });
      emitToSession("log", { line: "[qr] QR code generated" });
    });
    client.on("loading_screen", (p, m) => emitToSession("log", { line: `[loading] ${p}% ${m}` }));
    client.on("authenticated", () => emitToSession("log", { line: "[auth] authenticated" }));
    client.on("ready", () => {
      rec.status = "ready"; this.emit("status", { id, status: "ready" });
      emitToSession("status", { status: "ready" });
      emitToSession("log", { line: "[ready] client is ready" });
    });
    client.on("disconnected", (reason) => {
      rec.status = "disconnected"; this.emit("status", { id, status: "disconnected" });
      emitToSession("status", { status: "disconnected" });
      emitToSession("log", { line: `[disconnect] ${reason}` });
      (async () => {
        emitToSession("status", { status: "reconnecting" });
        rec.status = "reconnecting";
        await sleep(2000);
        try { client.initialize(); } catch (e) { emitToSession("log", { line: `[reconnect-error] ${e.message}` }); }
      })();
    });
    client.on("change_state", (s) => emitToSession("log", { line: `[state] ${s}` }));
    client.on("message", (m) => emitToSession("log", { line: `[message] from ${m.from} (ack:${m.ack})` }));
    client.on("message_ack", (m, ack) => emitToSession("log", { line: `[ack] to ${m.to} ack=${ack}` }));
    client.on("auth_failure", (m) => { rec.status = "disconnected"; emitToSession("status", { status: "disconnected" }); emitToSession("log", { line: "[auth-failure] " + m }); });

    client.initialize().catch((e) => { rec.status = "down"; emitToSession("log", { line: `[init-error] ${e.message}` }); });

    return { id, status: rec.status };
  }

  async sendText(id, to, message) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    if (rec.status !== "ready") throw new Error("Session not ready");
    const jid = this.normalizeJid(to);
    const res = await rec.client.sendMessage(jid, message);
    return { id, to: jid, messageId: res.id.id };
  }

  // ---- send media (single OR multiple) ----
  // Accepts:
  //  { to, url|data, mimetype?, filename?, caption? }  // single
  //  { to, items:[ {url|data, mimetype?, filename?, caption?}, ... ] } // multiple
  async sendMedia(id, body) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    if (rec.status !== "ready") throw new Error("Session not ready");

    const { to } = body || {};
    if (!to) throw new Error("to required");
    const jid = this.normalizeJid(to);

    const toItem = async (spec) => {
      if (spec.url) {
        const r = await fetch(spec.url);
        if (!r.ok) throw new Error(`fetch failed: ${r.status} ${r.statusText}`);
        const ctype = r.headers.get("content-type") || spec.mimetype || "application/octet-stream";
        const buf = Buffer.from(await r.arrayBuffer());
        const b64 = buf.toString("base64");
        return new MessageMedia(ctype, b64, spec.filename || undefined);
      }
      if (spec.data && (spec.mimetype || spec.mime || spec.type)) {
        const mt = spec.mimetype || spec.mime || spec.type;
        return new MessageMedia(mt, spec.data, spec.filename || undefined);
      }
      throw new Error("Media item requires either {url} or {data,mimetype}");
    };

    const items = Array.isArray(body.items) ? body.items : [body];
    const results = [];
    for (const spec of items) {
      const media = await toItem(spec);
      const res = await rec.client.sendMessage(jid, media, { caption: spec.caption });
      results.push({ messageId: res.id.id, filename: spec.filename || null });
      await sleep(350); // tiny gap between multiple sends
    }
    return { id, to: jid, count: results.length, results };
  }

  // ---- send location ----
  async sendLocation(id, body) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    if (rec.status !== "ready") throw new Error("Session not ready");

    const { to, lat, lng, description } = body || {};
    if (!to) throw new Error("to required");
    if (typeof lat !== "number" || typeof lng !== "number") throw new Error("lat and lng must be numbers");

    const jid = this.normalizeJid(to);
    const loc = new Location(lat, lng, description || "");
    const res = await rec.client.sendMessage(jid, loc);
    return { id, to: jid, messageId: res.id.id };
  }

  // ---- broadcast text ----
  async broadcastText(id, numbers, message, delayMs = 2000) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    if (rec.status !== "ready") throw new Error("Session not ready");
    if (!Array.isArray(numbers) || numbers.length === 0) throw new Error("numbers array required");

    const results = [];
    for (const raw of numbers) {
      const jid = this.normalizeJid(raw);
      try {
        const res = await rec.client.sendMessage(jid, message);
        results.push({ to: jid, ok: true, messageId: res.id.id });
      } catch (e) {
        results.push({ to: jid, ok: false, error: e.message });
      }
      await sleep(delayMs);
    }
    return { id, count: results.length, results };
  }

  // ---- broadcast one media item to many numbers ----
  // item: same spec as sendMedia single (url OR data+mimetype+filename, plus optional caption)
  async broadcastMedia(id, numbers, item, delayMs = 2500) {
    const rec = this.ensureRecord(id);
    if (!rec.client) throw new Error("Session not started");
    if (rec.status !== "ready") throw new Error("Session not ready");
    if (!Array.isArray(numbers) || numbers.length === 0) throw new Error("numbers array required");

    // Prepare media once if using URL (download here) to avoid repeated fetches
    const prepItem = async (spec) => {
      if (spec.url) {
        const r = await fetch(spec.url);
        if (!r.ok) throw new Error(`fetch failed: ${r.status} ${r.statusText}`);
        const ctype = r.headers.get("content-type") || spec.mimetype || "application/octet-stream";
        const buf = Buffer.from(await r.arrayBuffer());
        const b64 = buf.toString("base64");
        return new MessageMedia(ctype, b64, spec.filename || undefined);
      }
      if (spec.data && (spec.mimetype || spec.mime || spec.type)) {
        const mt = spec.mimetype || spec.mime || spec.type;
        return new MessageMedia(mt, spec.data, spec.filename || undefined);
      }
      throw new Error("Media item requires either {url} or {data,mimetype}");
    };

    const media = await prepItem(item);
    const results = [];
    for (const raw of numbers) {
      const jid = this.normalizeJid(raw);
      try {
        const res = await rec.client.sendMessage(jid, media, { caption: item.caption });
        results.push({ to: jid, ok: true, messageId: res.id.id });
      } catch (e) {
        results.push({ to: jid, ok: false, error: e.message });
      }
      await sleep(delayMs);
    }
    return { id, count: results.length, results };
  }
}
