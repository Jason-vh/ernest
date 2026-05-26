const port = Number(process.env.PORT ?? 3000);
const html = await Bun.file(`${import.meta.dir}/index.html`).bytes();

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") {
      return new Response("ok");
    }
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
});

console.log(`Ernest is at rest. Listening on :${port}`);
