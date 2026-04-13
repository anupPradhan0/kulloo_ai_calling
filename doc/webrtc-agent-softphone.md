# WebRTC Agent Softphone

Kulloo supports an interactive browser-based softphone that allows human agents to handle and place calls natively. Instead of running the automated "hello" IVR script, the system bridges the active channel to a SIP endpoint registered over Secure WebSockets (WSS).

This flow operates identically alongside existing call tracking: your backend handles call document creation, records the media stream using FreeSWITCH, logs DTMF tones from the agent interface, and finally closes the record cleanly—without losing any existing database integrity.

## Architecture & Configuration

The Agent Softphone requires three major components to be active. This entire flow is gated by setting `AGENT_MODE=webrtc` in your backend `.env`.

### 1. The Signaling Edge (sip.js over WSS)

To bridge a browser natively to FreeSWITCH, we bypass the Kamailio layer entirely for the internal network leg.
* The frontend uses `sip.js` to register directly to FreeSWITCH's internal WSS (WebSocket Secure) listener on port `7443`.
* A specific Sofia SIP profile (`webrtc.xml`) handles incoming TLS registrations.
* **Important:** WSS requires strict TLS checks (no self-signed certs pass modern browsers). See `freeswitch/README-tls.md` for certificate mounting instructions.

### 2. The Internal Out-Of-Band WebSocket (`/ws/agent`)

Because SIP signaling occurs directly between the browser and FreeSWITCH, the Kulloo Backend uses its own WebSocket at `/ws/agent` to communicate immediate state to the frontend (e.g. telling the React app an incoming call has been offered before SIP even connects the bridge).
* Exposes `inbound_call.offered`, `call.answered`, and `call.ended`.
* Allows the Agent UI to show the "Incoming Call" overlay containing the actual Mongo `callId` and `from`/`to` fields.

### Multi-node FreeSWITCH and Kamailio

If you run **more than one** FreeSWITCH container (for example `fs1` and `fs2` in Docker Compose), Kamailio’s dispatcher normally **round-robins** between them. **WebRTC registrations are per instance:** the browser only registers to the node that exposes WSS (by default **`fs1`** on port **7443**). An inbound call that lands on **`fs2`** still triggers `inbound_call.offered` over `/ws/agent`, but FreeSWITCH runs `bridge user/agent1@…` on **fs2**, where that user is **not** registered, so **no SIP INVITE** reaches sip.js and the Answer button stays disabled until the bridge fails or times out.

**Operational fix:** For `AGENT_MODE=webrtc`, either remove extra media nodes from `kamailio/dispatcher.list` or set the spare line’s flags to **`2`** (inactive), then `kamcmd … dispatcher.reload`. See comments at the top of `dispatcher.list`.

### 3. The ESL Call Handler Bridge

When `AGENT_MODE=webrtc` is set, `EslCallHandlerService.executeCallFlow` switches tracks:
1. Answers the incoming ring.
2. Identifies or creates the MongoDB `Call` and starts the FreeSWITCH recording.
3. Broadcasts the `inbound_call.offered` WebSocket event to the UI so it can render.
4. Executes the FreeSWITCH `bridge` action directly to `user/agent1@<FREESWITCH_DOMAIN>`.
5. When the user drops the call or the remote hangs up, it automatically finalizes the recording and closes the Mongo document natively.

## Environment Variables

For the WebRTC flow to function, the backend environment variables must provide the credentials for the agent.

```env
# REQUIRED for Agent mode
AGENT_MODE="webrtc"
FREESWITCH_WSS_URL="wss://your-freeswitch-domain.com:7443"
FREESWITCH_DOMAIN="your-freeswitch-domain.com"
AGENT_SIP_USERNAME="agent1"
AGENT_SIP_PASSWORD="YourSecurePassword"
STUN_SERVER_URL="stun:stun.l.google.com:19302"
```
*(The password above must actively match the XML directory file hardcoded at `freeswitch/conf/directory/default/agent1.xml`)*

## The UI Path

The UI relies strictly on two Context Providers:
1. **`AgentWsProvider`**: Manages the API WebSocket (`/ws/agent`), receiving the aforementioned events securely.
2. **`SipProvider`**: Constructs a massive `UserAgent` from `sip.js`, retrieves SIP configurations asynchronously via `/api/agent/credentials`, requests Microphone permissions, connects the inbound WSS stream, and wires remote audio into a hidden `<audio id="remoteAudio">` HTML element.

If you ever wish to disable agent operations and revert to the API Automated IVR bot, simply change or remove the `AGENT_MODE` key in your backend environment.
