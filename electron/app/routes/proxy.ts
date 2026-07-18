import { Request, Response } from "express";
import { app, net, session, BrowserWindow } from "electron";
import WebSocket from "ws";
import { RateLimits } from "../services/RateLimitParser";
import {
  ALLOWED_PROXY_HOSTS,
  isAllowedProxyHost,
  isPathOfExileHost,
  sanitizeProxyRequestHeaders,
  sanitizeProxyResponseHeaders,
} from "../proxySecurity";

const hosts = ALLOWED_PROXY_HOSTS.map((url) => ({ url }));

export const proxy = async (req: Request, res: Response) => {
  const proxyTo = req.url.split("/")[1];
  const host = hosts.find((candidate) => candidate.url === proxyTo);

  if (!proxyTo || !isAllowedProxyHost(proxyTo) || !host) {
    res.writeHead(403);
    res.end(`Invalid host ${proxyTo}`);
    return;
  }

  if (host) {
    const usePoeApiPolicy = isPathOfExileHost(host.url);
    const remainder = req.url.split("/").slice(2).join("/");
    const url = `https://${host.url}/${remainder}`;
    const params = {
      url,
      method: req.method,
      headers: {
        ...sanitizeProxyRequestHeaders(req.headers),
        "user-agent":
          app.userAgentFallback + "(contact: micahriggan@gmail.com)",
      },
      useSessionCookies: true,
      referrerPolicy: "no-referrer-when-downgrade",
    };
    if (usePoeApiPolicy) {
      await RateLimits.waitForLimit();
    }
    const proxyReq = net.request(params);

    const proxyReqStream = proxyReq as unknown as NodeJS.WritableStream;

    proxyReq.on("response", (proxyRes) => {
      const resHeaders = sanitizeProxyResponseHeaders(proxyRes.headers);

      if (usePoeApiPolicy && proxyRes.statusCode === 401) {
        openAuthWindow();
      }

      if (usePoeApiPolicy) {
        RateLimits.parse(proxyRes.headers);
      }
      res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, resHeaders);

      const proxyResStream = proxyRes as unknown as NodeJS.ReadableStream;
      proxyResStream.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error(err);
      res.writeHead(500);
      res.end(err);
    });

    req.pipe(proxyReqStream);
  }
};

async function getCookiesHeader(host: string): Promise<string> {
  try {
    // Electron's cookie API requires a URL; use HTTPS for secure cookies.
    const cookies = await session.defaultSession.cookies.get({
      url: `https://${host}`,
    });
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch (error) {
    console.error("Failed to retrieve cookies:", error);
    return "";
  }
}

export const openAuthWindow = () => {
  const authwin = new BrowserWindow({
    width: 800,
    height: 600,
  });
  authwin.loadURL("https://www.pathofexile.com/trade2/search/poe2/Standard/");
  return authwin;
};

export const wsProxy = async (clientSocket: WebSocket, req: Request) => {
  // Split and filter the URL path to remove empty strings.
  const parts = req.url.split("/").filter(Boolean);
  // parts example: ["proxy", "pathofexile.com", "api", "trade2", "live", "poe2", "Standard", "d9eKbLPTJ"]

  // The host should be the second segment (after the "proxy" prefix).
  const proxyTo = parts[1];
  const host = hosts.find((candidate) => candidate.url === proxyTo);
  if (!host) {
    // Use a valid WebSocket close code, e.g., 1008 (Policy Violation)
    clientSocket.close(1008, `Invalid host ${proxyTo}`);
    return;
  }

  // The remainder of the URL (after the host)
  const remainder = parts.slice(2).join("/");
  const url = `wss://${host.url}/${remainder}`;
  // Get cookies from the system.
  const cookieHeader = await getCookiesHeader(host.url);

  // Create a WebSocket connection to the target server.
  const ws = new WebSocket(url, {
    headers: {
      cookie: cookieHeader,
      origin: "https://www.pathofexile.com",
      "user-agent": app.userAgentFallback,
    },
  });

  ws.on("open", () => {
    console.log("WebSocket connection opened");
  });

  ws.on("message", (data) => {
    clientSocket.send(data);
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    clientSocket.close();
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (error.message.includes("401")) {
      const authwin = new BrowserWindow({
        width: 800,
        height: 600,
      });
      authwin.loadURL(
        "https://www.pathofexile.com/trade2/search/poe2/Standard/",
      );

      clientSocket.close(1008, "Unauthorized");
      return;
    }
    // Use a valid error code, e.g., 1011 (Internal Error)
    clientSocket.close(1011, error.message || "WebSocket error");
  });

  clientSocket.on("message", (data) => {
    ws.send(data);
  });

  clientSocket.on("close", () => {
    ws.close();
  });
};
