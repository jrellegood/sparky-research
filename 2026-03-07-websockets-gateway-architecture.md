# Real-Time Communication: WebSockets, SSE, and the Gateway Pattern That Makes Agentic Systems Responsive

When you build an agentic system, one fundamental question determines everything else: how does the server tell the client that something happened?

Your AI agent just finished processing a task. A cron job triggered. A sub-agent completed its work. The server needs to push this information to the client *right now*, not whenever the client decides to ask. This is the real-time communication problem, and getting it wrong means your "proactive" agent becomes a slow, polling-based mess that burns bandwidth and feels laggy.

There are three main approaches: **polling** (ask repeatedly), **Server-Sent Events** (SSE, one-way stream), and **WebSockets** (full bidirectional channel). Each has different trade-offs around complexity, latency, scalability, and infrastructure compatibility. Let's look at what they actually mean for building responsive agentic systems.

## The Three Patterns: When to Use Each

### Polling: The Fallback You Hope to Avoid

Polling is simple: the client asks "anything new?" every N seconds. The server responds immediately, whether there's new data or not.

```javascript
// Simple polling - works everywhere, wastes everything
setInterval(() => {
  fetch('/api/status')
    .then(res => res.json())
    .then(data => console.log('Status:', data));
}, 5000); // Ask every 5 seconds
```

**Pros:**
- Works everywhere (plain HTTP, no special infrastructure)
- Trivial to implement
- Gets through corporate firewalls without drama

**Cons:**
- Wasteful: 99% of requests return "nothing new"
- Latency: up to N seconds delay before client sees updates
- Server load scales badly (every client hammering every N seconds)

**When to use it:** As a fallback when WebSockets or SSE won't work (legacy browsers, restrictive corporate networks). Or when updates are genuinely infrequent and latency doesn't matter.

### Server-Sent Events: The Underrated Middle Ground

SSE is a one-way HTTP stream from server to client. The client opens a connection, and the server keeps it alive, trickling down events as they happen.

```javascript
// Client-side SSE - surprisingly simple
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Server pushed:', data);
};

// Auto-reconnects on connection loss
```

Server-side (Node.js example):
```javascript
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Push events as they happen
  eventEmitter.on('agentComplete', send);
  
  req.on('close', () => {
    eventEmitter.off('agentComplete', send);
  });
});
```

**Pros:**
- Simple to implement (plain HTTP, no protocol upgrade)
- Auto-reconnect built into browser API
- Great for server-to-client push (agent status, notifications, updates)
- Better firewall/proxy compatibility than WebSockets

**Cons:**
- One-way only (client can't send over same connection)
- Browser limit: 6 connections per domain (HTTP/1.1)
- Not ideal for high-frequency bidirectional messaging

**When to use it:** When you need server push but not bidirectional chat. Perfect for agent status updates, progress notifications, or event streams where the client mostly listens.

### WebSockets: Full-Duplex When You Need It

WebSockets establish a persistent, bidirectional TCP connection. Both client and server can send messages anytime, with minimal overhead.

```javascript
// Client-side WebSocket
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'agent-events' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Received:', msg);
};

// No auto-reconnect - you have to build it
ws.onclose = () => {
  setTimeout(() => connectWebSocket(), 1000);
};
```

**Pros:**
- Lowest latency (persistent connection, no HTTP overhead)
- Bidirectional: client and server send freely
- Efficient for high-frequency messaging

**Cons:**
- More complex (protocol upgrade, manual reconnection, heartbeats)
- Proxies/firewalls may block non-HTTP traffic
- Higher server resource usage (long-lived connections)
- No built-in reconnection logic

**When to use it:** When you need low-latency, bidirectional communication. Think chat apps, collaborative editing, real-time multiplayer, or—relevant here—a Gateway protocol where the client and server exchange messages frequently.

## How OpenClaw Uses WebSockets: The Gateway Pattern

OpenClaw's architecture uses WebSockets for its Gateway protocol because both the client and server need to send messages:

- **Client → Server:** User messages, tool call responses, heartbeat pings
- **Server → Client:** Agent responses, tool calls, status updates, sub-agent results

The Gateway maintains a persistent WebSocket connection. When a cron job fires or a sub-agent completes, the server can immediately push the result to the client without waiting for a poll.

But WebSockets aren't magic. Here's what you have to handle:

### 1. Heartbeats (Ping/Pong)

Connections can "zombie"—they appear open but are actually dead. You need heartbeats to detect this:

```javascript
class HeartbeatWebSocket {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.heartbeatInterval = 30000; // 30s
    
    this.ws.onopen = () => {
      this.startHeartbeat();
    };
    
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'pong') {
        clearTimeout(this.pongTimeout);
      } else {
        this.handleMessage(msg);
      }
    };
  }
  
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.ws.send(JSON.stringify({ type: 'ping' }));
      
      // If no pong in 5s, connection is dead
      this.pongTimeout = setTimeout(() => {
        console.log('Heartbeat failed, reconnecting');
        this.ws.close();
      }, 5000);
    }, this.heartbeatInterval);
  }
}
```

### 2. Reconnection with Exponential Backoff

Unlike SSE, WebSockets don't auto-reconnect. You build it:

```javascript
class ReconnectingWebSocket {
  constructor(url) {
    this.url = url;
    this.attempts = 0;
    this.maxAttempts = 10;
    this.connect();
  }
  
  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      this.attempts = 0; // Reset on success
    };
    
    this.ws.onclose = () => {
      if (this.attempts >= this.maxAttempts) {
        console.error('Max reconnect attempts reached');
        return;
      }
      
      // Exponential backoff: 1s, 1.5s, 2.25s, ...
      const delay = Math.min(
        1000 * Math.pow(1.5, this.attempts),
        30000 // Cap at 30s
      );
      
      this.attempts++;
      setTimeout(() => this.connect(), delay);
    };
  }
}
```

### 3. Message Queuing During Disconnects

When the connection drops, you need to queue outgoing messages:

```javascript
class QueuedWebSocket {
  constructor(url) {
    this.queue = [];
    this.maxQueueSize = 100;
    // ... setup connection
  }
  
  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue for later
      if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift(); // Drop oldest
      }
      this.queue.push(message);
    }
  }
  
  flushQueue() {
    while (this.queue.length > 0) {
      this.send(this.queue.shift());
    }
  }
}
```

## The Decision Matrix

Here's how to choose:

| Need | Use This | Why |
|------|----------|-----|
| Server push, client mostly listens | **SSE** | Simple, auto-reconnect, firewall-friendly |
| Infrequent updates, legacy compatibility | **Polling** | Works everywhere, good enough for low-frequency |
| Bidirectional, low-latency messaging | **WebSockets** | Full-duplex, minimal overhead |
| Corporate network, unknown firewall rules | **SSE or Polling** | HTTP-only, less likely to be blocked |
| High-frequency updates (100+ msg/sec) | **WebSockets** | Lowest overhead per message |

For agentic systems specifically:

- **Heartbeat-based proactive agents:** SSE for server push, HTTP POST for client requests
- **Interactive chat UI:** WebSockets for low-latency back-and-forth
- **Sub-agent orchestration:** WebSockets if coordinating frequently, SSE if just receiving completion notifications
- **Cron job delivery:** Either works; SSE is simpler

## Scaling Considerations

When you hit thousands of concurrent connections:

1. **Sticky sessions:** Load balancers must route reconnections to the same server instance (stateful connections)
2. **Pub/Sub backend:** Use Redis or similar to share messages across server instances
3. **Backpressure:** Throttle greedy clients to prevent resource exhaustion
4. **Connection pooling:** Limit connections per client, reuse across features

SSE has an edge here: plain HTTP means simpler load balancing and better proxy compatibility. WebSockets require WebSocket-aware infrastructure (NGINX, HAProxy configured correctly).

## The Real-World Gotcha: Mobile Apps

On iOS/Android, background apps lose their persistent connections. The OS kills them to save battery. For mobile, you can't rely on WebSockets or SSE staying open. Use mobile push notifications (APNs, FCM) for critical alerts, and reconnect when the app returns to foreground.

## What OpenClaw Gets Right

By using WebSockets for its Gateway protocol, OpenClaw optimizes for the interactive use case: you're chatting with an agent, it's calling tools, you're responding. Low latency matters. Bidirectional communication is essential.

But it also means you need robust reconnection logic (which the Gateway handles) and accept that some environments (restrictive firewalls, mobile background) won't maintain the connection. That's why isolated sessions can still work asynchronously and deliver results later.

The key insight: **real-time communication isn't about the technology, it's about matching the protocol to your interaction pattern.** If your agent mostly broadcasts updates, SSE is simpler. If it's a conversation, WebSockets win. If you're just checking status occasionally, polling is fine.

Pick based on your actual needs, not the "coolest" tech. SSE is underrated. Polling is often good enough. WebSockets are powerful but require more infrastructure. Build what fits your system, not what the hype cycle demands.

---

**Further Reading:**
- [WebSocket Architecture Best Practices (Ably)](https://ably.com/topic/websocket-architecture-best-practices)
- [WebSockets vs SSE vs Polling (RxDB)](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
