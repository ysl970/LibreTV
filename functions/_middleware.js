// functions/_middleware.js

async function getSha256Hex(text) {
  if (!text) {
    return ""; 
  }
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error("Error calculating SHA-256 hash:", error);
    return ""; 
  }
}

class EnvInjectHandler {
  constructor(passwordHash) {

    this.placeholder = 'window.__ENV__.PASSWORD = "{{PASSWORD}}";';

    this.replacement = `window.__ENV__.PASSWORD = "${passwordHash}"; // SHA-256 hash`;
    this.replaced = false; 
  }

  text(textChunk) {
   
    if (!this.replaced && textChunk.text.includes(this.placeholder)) {

      textChunk.replace(this.replacement, { html: false });
      this.replaced = true; // Mark as replaced
      console.log("Injected PASSWORD hash into HTML response.");
    }
  }
}


export async function onRequest(context) {
  const { request, env, next } = context;
  let response;

  try {
    response = await next();

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return response;
    }

    // It's HTML, proceed with injection
    const password = env.PASSWORD || ""; // Get password from environment
    const passwordHash = await getSha256Hex(password); // Calculate hash using Web Crypto

    const rewriter = new HTMLRewriter();
    const handler = new EnvInjectHandler(passwordHash);

    rewriter.on('*', handler); 
    return rewriter.transform(response);

  } catch (error) {

    console.error("Error in middleware while processing request:", error);
     return new Response("An internal error occurred", { status: 500 });
     if (error instanceof Response) {
         return error;
     }
     return new Response(error.message || "Internal Server Error", { status: 500 });
  }
}
