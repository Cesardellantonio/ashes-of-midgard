/* Ashes of Midgard: squad chat settings (js/squad-chat.js). See docs/SQUAD-RELAY-SETUP.md.
   Leave `relay: null` and companions talk with their own offline lines (no network at all).
   To turn on cloud chat, deploy the relay in worker/ and paste its address in place of null, for example:
     relay: 'https://aom-squad-relay.your-name.workers.dev',
   The address is not a secret: the relay only answers signed-in players of this site, with per-player limits and a
   monthly spending cap. The Anthropic API key lives only in the relay (a Cloudflare secret), never here.
   `model` is a request: the relay only accepts the models on its own allow list. */
window.AOM_SQUAD = Object.assign({
  relay: null /* user pastes the relay URL here */,
  model: 'claude-haiku-4-5-20251001'
}, window.AOM_SQUAD || {});
