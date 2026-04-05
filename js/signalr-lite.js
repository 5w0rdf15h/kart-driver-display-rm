/* ═══════════════════════════════════════════════
   SignalR 2.2 Lite Client — No jQuery dependency
   Minimal implementation for RaceMann integration
   Author: 5w0rdf15h — https://github.com/5w0rdf15h/
   ═══════════════════════════════════════════════ */

class SignalRLite {
  constructor(baseUrl, hubNames) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.hubNames = hubNames; // ['racehub']
    this.ws = null;
    this.token = null;
    this.messageId = 0;
    this.callbacks = {};  // invocation callbacks
    this.handlers = {};   // server → client handlers
    this.onConnected = null;
    this.onDisconnected = null;
    this.onError = null;
    this.reconnectTimer = null;
    this.keepAliveTimer = null;
  }

  // Register a handler for server → client calls
  on(hubName, method, callback) {
    const key = `${hubName.toLowerCase()}.${method.toLowerCase()}`;
    this.handlers[key] = callback;
  }

  // Invoke a server method
  invoke(hubName, method, ...args) {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.callbacks[id] = { resolve, reject };
      const msg = JSON.stringify({
        H: hubName,
        M: method,
        A: args,
        I: id,
      });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(msg);
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  // Connect to SignalR hub
  async connect() {
    // Step 1: Negotiate
    const connData = encodeURIComponent(
      JSON.stringify(this.hubNames.map(n => ({ name: n })))
    );
    const negotiateUrl = `${this.baseUrl}/signalr/negotiate?clientProtocol=1.5&connectionData=${connData}&_=${Date.now()}`;

    let negotiateData;
    try {
      const resp = await fetch(negotiateUrl);
      if (!resp.ok) throw new Error(`Negotiate failed: ${resp.status}`);
      negotiateData = await resp.json();
    } catch (e) {
      // CORS blocked? Try JSONP fallback
      try {
        negotiateData = await this._negotiateJsonp(connData);
      } catch (e2) {
        throw new Error(`Cannot connect (CORS blocked). ${e.message}`);
      }
    }

    this.token = negotiateData.ConnectionToken;

    // Step 2: Open WebSocket
    const wsProto = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    const tokenEnc = encodeURIComponent(this.token);
    const wsUrl = `${wsProto}://${host}/signalr/connect?transport=webSockets&clientProtocol=1.5&connectionToken=${tokenEnc}&connectionData=${connData}&tid=${Math.floor(Math.random() * 11)}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        // Step 3: Start
        try {
          const startUrl = `${this.baseUrl}/signalr/start?transport=webSockets&clientProtocol=1.5&connectionToken=${tokenEnc}&connectionData=${connData}&_=${Date.now()}`;
          const startResp = await fetch(startUrl);
          if (startResp.ok) {
            const startData = await startResp.json();
            if (startData.Response === 'started') {
              this._startKeepAlive(negotiateData.KeepAliveTimeout);
              if (this.onConnected) this.onConnected();
              resolve();
            }
          }
        } catch (e) {
          // Start might be CORS blocked too — WS is already open, proceed anyway
          this._startKeepAlive(20);
          if (this.onConnected) this.onConnected();
          resolve();
        }
      };

      this.ws.onmessage = (event) => {
        if (!event.data) return;
        try {
          const data = JSON.parse(event.data);
          this._handleMessage(data);
        } catch (e) {}
      };

      this.ws.onerror = (event) => {
        if (this.onError) this.onError(event);
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        clearInterval(this.keepAliveTimer);
        if (this.onDisconnected) this.onDisconnected();
      };

      // Timeout
      setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  _handleMessage(data) {
    // Invocation responses (I field = our call ID)
    if (data.I !== undefined) {
      const cb = this.callbacks[data.I];
      if (cb) {
        cb.resolve(data.R || data);
        delete this.callbacks[data.I];
      }
    }

    // Server → client messages
    if (data.M && Array.isArray(data.M)) {
      for (const msg of data.M) {
        if (msg.H && msg.M) {
          const key = `${msg.H.toLowerCase()}.${msg.M.toLowerCase()}`;
          const handler = this.handlers[key];
          if (handler) {
            handler(...(msg.A || []));
          }
        }
      }
    }
  }

  _startKeepAlive(timeoutSec) {
    // Send empty object as keepalive before timeout
    const interval = (timeoutSec || 20) * 1000 * 0.5;
    this.keepAliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('{"H":"racehub","M":"GetLastRaceId","A":[],"I":' + (this.messageId++) + '}');
      }
    }, Math.min(interval, 10000));
  }

  // JSONP fallback for negotiate (avoids CORS)
  _negotiateJsonp(connData) {
    return new Promise((resolve, reject) => {
      const cbName = '_signalr_cb_' + Date.now();
      const url = `${this.baseUrl}/signalr/negotiate?clientProtocol=1.5&connectionData=${connData}&callback=${cbName}&_=${Date.now()}`;

      window[cbName] = (data) => {
        delete window[cbName];
        document.head.removeChild(script);
        resolve(data);
      };

      const script = document.createElement('script');
      script.src = url;
      script.onerror = () => {
        delete window[cbName];
        document.head.removeChild(script);
        reject(new Error('JSONP negotiate failed'));
      };
      document.head.appendChild(script);

      setTimeout(() => {
        if (window[cbName]) {
          delete window[cbName];
          try { document.head.removeChild(script); } catch(e) {}
          reject(new Error('JSONP timeout'));
        }
      }, 8000);
    });
  }

  disconnect() {
    clearInterval(this.keepAliveTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
