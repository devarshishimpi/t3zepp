const ORCHESTRATION_PROTOCOL_VERSION = "2";
const TICKET_PATH = "/api/auth/websocket-ticket/rpc";
const SOCKET_PATH = "/ws";
const MAX_FRAME_CHARS = 1_000_000;

function parseJson(text) {
  if (typeof text !== "string" || text.length > MAX_FRAME_CHARS) {
    throw new Error("T3 returned an invalid response frame");
  }
  return JSON.parse(text);
}

function baseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("T3_BASE_URL must be a public HTTPS origin");
  }
  return url;
}

async function getSocketTicket(origin, accessToken, fetchImpl) {
  const ticketUrl = new URL(TICKET_PATH, origin);
  let response;
  try {
    response = await fetchImpl(ticketUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "bypass-tunnel-reminder": "true",
        "user-agent": "t3zepp/0.1.7",
      },
    });
  } catch {
    throw new Error("T3 ticket request failed");
  }
  if (!response.ok) throw new Error(`T3 authorization failed (${response.status})`);
  const payload = await response.json();
  if (typeof payload?.ticket !== "string" || payload.ticket.length < 8) {
    throw new Error("T3 did not issue an RPC ticket");
  }
  return payload.ticket;
}

function connectSocket(origin, ticket, fetchImpl) {
  const url = new URL(SOCKET_PATH, origin);
  url.searchParams.set("wsTicket", ticket);
  url.searchParams.set("orchestrationProtocol", ORCHESTRATION_PROTOCOL_VERSION);
  return fetchImpl(url, {
    headers: {
      Upgrade: "websocket",
      "bypass-tunnel-reminder": "true",
      "user-agent": "t3zepp/0.1.7",
    },
  }).then((response) => {
    if (!response.webSocket) throw new Error(`T3 WebSocket upgrade failed (${response.status})`);
    response.webSocket.accept();
    return response.webSocket;
  }).catch((error) => {
    if (error instanceof Error && error.message.startsWith("T3 WebSocket upgrade failed (")) throw error;
    throw new Error("T3 WebSocket request failed");
  });
}

function rpcOnSocket(socket, { id, tag, payload, stream = false }, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
    };
    const finish = (callback, value) => {
      cleanup();
      callback(value);
    };
    const onError = () => finish(reject, new Error("T3 WebSocket failed"));
    const onClose = () => finish(reject, new Error("T3 closed the RPC connection"));
    const onMessage = (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const decoded = parseJson(raw);
        const messages = Array.isArray(decoded) ? decoded : [decoded];
        for (const message of messages) {
          if (message?.requestId !== id) continue;
          if (stream && message._tag === "Chunk") {
            socket.send(JSON.stringify({ _tag: "Ack", requestId: id }));
            finish(resolve, message.values?.[0]);
            return;
          }
          if (message._tag === "Exit") {
            if (message.exit?._tag === "Success") finish(resolve, message.exit.value);
            else finish(reject, new Error("T3 denied or failed the requested Usage read"));
            return;
          }
        }
      } catch (error) {
        finish(reject, error);
      }
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
    timer = setTimeout(() => finish(reject, new Error("T3 RPC timed out")), timeoutMs);
    try {
      socket.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] }));
    } catch {
      finish(reject, new Error("Could not send the T3 RPC request"));
    }
  });
}

export async function readT3Usage({ base, accessToken, usageInput, usageInputs, fetchImpl = fetch, timeoutMs = 12_000 }) {
  if (typeof base !== "string" || typeof accessToken !== "string" || !accessToken) {
    throw new Error("T3 connection is not configured");
  }
  const origin = baseUrl(base);
  const ticket = await getSocketTicket(origin, accessToken, fetchImpl);
  const socket = await connectSocket(origin, ticket, fetchImpl);

  const entries = usageInputs || { default: usageInput };
  const usagePending = Object.entries(entries).map(([name, payload], index) => rpcOnSocket(
    socket,
    {
      id: usageInputs ? `zepp-usage-${name}` : "zepp-usage",
      tag: "server.getUsageSummary",
      payload,
    },
    timeoutMs,
  ).then((usage) => [name, usage]));
  const pending = [
    Promise.all(usagePending),
    rpcOnSocket(
      socket,
      {
        id: "zepp-config",
        tag: "subscribeServerConfig",
        payload: {
          usageLimitSources: true,
          workspaceSnapshotsOnDemand: true,
          providerCatalogsOnDemand: true,
        },
        stream: true,
      },
      timeoutMs,
    ),
  ];
  try {
    const [[...usageEntries], configEvent] = await Promise.all(pending);
    const usages = Object.fromEntries(usageEntries);
    if (Object.values(usages).some((usage) => !usage || !Array.isArray(usage.buckets)) || configEvent?.type !== "snapshot") {
      throw new Error("T3 returned an incomplete Usage snapshot");
    }
    return {
      usage: usages.default || usages.hourly || Object.values(usages)[0],
      ...(usageInputs ? { usages } : {}),
      providers: Array.isArray(configEvent.config?.providers) ? configEvent.config.providers : [],
      usageLimitSources: Array.isArray(configEvent.config?.usageLimitSources)
        ? configEvent.config.usageLimitSources
        : [],
    };
  } finally {
    try {
      socket.send(JSON.stringify({ _tag: "Interrupt", requestId: "zepp-config", interruptors: [] }));
      socket.close(1000, "Usage snapshot received");
    } catch {
      // The socket may already have closed after an upstream failure.
    }
  }
}
