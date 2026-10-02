import http from "http";

const TARGET = "https://madrasacloud.xyz";
const PORT = 8080;

const server = http.createServer(async (req, res) => {
  const clientIp =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "unknown";

  const targetUrl = `${TARGET}${req.url}`;

  console.log("\n========================================");
  console.log(`[${new Date().toISOString()}] Incoming request`);
  console.log(`Client IP : ${clientIp}`);
  console.log(`Method    : ${req.method}`);
  console.log(`Path      : ${req.url}`);
  console.log(`Forward   : ${targetUrl}`);

  try {
    // Request body সংগ্রহ
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      const body = Buffer.concat(chunks);

      if (body.length > 0) {
        console.log(`Body      : ${body.length} bytes`);

        console.log(
          body.toString("utf8").slice(0, 500)
        );
      }

      // Incoming headers copy
      const headers = {
        ...req.headers,

        // Host পরিবর্তন করে target domain দেওয়া
        host: new URL(TARGET).host,

        // Proxy information
        "x-forwarded-for": clientIp,
        "x-forwarded-proto": "http",
        "x-proxy-server": "zkteco-central-proxy",
      };

      // hop-by-hop headers বাদ
      delete headers.connection;
      delete headers["keep-alive"];
      delete headers["proxy-authenticate"];
      delete headers["proxy-authorization"];
      delete headers.te;
      delete headers.trailer;
      delete headers["transfer-encoding"];
      delete headers.upgrade;

      const upstreamResponse = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method !== "GET" && req.method !== "HEAD"
            ? body
            : undefined,
      });

      let responseBody = await upstreamResponse.text();

      /*
       * ZKTeco specific logic
       *
       * madrasacloud.xyz যদি Stamp=9999 পাঠায়,
       * তাহলে Stamp=0 করে machine-কে পাঠানো হবে।
       */
      if (responseBody.includes("Stamp=9999")) {
        responseBody = responseBody.replace(
          "Stamp=9999",
          "Stamp=0"
        );
      }

      console.log(
        `Response   : ${upstreamResponse.status}`
      );

      console.log(
        `Response body: ${responseBody.slice(0, 300)}`
      );

      // Response headers
      const responseHeaders = {
        "content-type":
          upstreamResponse.headers.get("content-type") ||
          "text/plain; charset=utf-8",

        "cache-control": "no-cache",
      };

      res.writeHead(
        upstreamResponse.status,
        responseHeaders
      );

      res.end(responseBody);
    });
  } catch (error) {
    console.error("Proxy error:", error);

    if (!res.headersSent) {
      res.writeHead(502, {
        "content-type": "text/plain; charset=utf-8",
      });
    }

    res.end("Bad Gateway");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
=============================================
🚀 ZKTeco Central Proxy Started
=============================================

Listening:
http://0.0.0.0:${PORT}

Forwarding:
${TARGET}

=============================================
`);
});