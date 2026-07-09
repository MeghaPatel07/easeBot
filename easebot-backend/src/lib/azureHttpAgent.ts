import https from 'https'

// Shared HTTPS agent for every AzureOpenAI client in this backend.
//
// keepAlive is deliberately OFF here. The openai SDK's default Node agent
// (agentkeepalive) pools connections, and Railway's egress path (or Azure's
// own load balancer) can silently drop an idle pooled socket faster than the
// client notices. The next request then gets handed that half-dead socket,
// writes to it, and the read comes back as `ERR_STREAM_PREMATURE_CLOSE`
// ("Premature close") with zero bytes received — which is exactly what
// production was seeing on every mode (chat/image/tool-call), since they all
// funnel through this same client. A fresh TCP+TLS handshake per request
// costs low-latency milliseconds against an LLM call that already takes
// seconds, so it's a fine trade for eliminating this failure mode entirely.
export const azureHttpAgent = new https.Agent({ keepAlive: false })
