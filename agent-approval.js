/* The host's approval cards (P4; 助手面板 v7.2 §2 「要你点头的卡」; Deja, step 3: in the message stream, no longer a box over the
   page). QQ 4: only the host shows them. A card is made only by ask(), from a decision the main process issued with a ticket
   (agent-policy-host.js); nothing a reply says can make one, approve one or answer one. It belongs to the reply (or plan) it
   is about, and waits until one of its own buttons is clicked: answer(id, choice) settles the waiting card once, with one of
   the choices the main process offered (anything else counts as 「不同意」). The caller then sends that answer to the main
   process with the ticket, which answers once too. While a card waits the AI's step waits, and the page lets nothing be sent.
   Leaving the chat, the project changing, or a newer card while one waits: 「不同意」. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipApproval = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ORDER = ["once", "session", "deny"];
  let seq = 0;
  /** onChange(): the page redraws. context(): the project the card is about, as a string (a change denies the card). */
  function create({ onChange = () => {}, context = () => "" } = {}) {
    const cards = new WeakMap(), loose = {};
    let pending = null;
    const settle = (card, choice) => {
      if (!card || card.answered) return false;
      card.answered = card.d.choices.includes(choice) ? choice : "deny";
      if (pending === card) pending = null;
      onChange();
      card.resolve(card.answered);
      return true;
    };
    return {
      /** A card for a decision with a ticket; resolves to once | session | deny. */
      ask(d, { result = null, summary = "", content = null, detail = "" } = {}) {
        if (!d || typeof d.ticket !== "string" || !Array.isArray(d.choices) || !d.choices.length) return Promise.resolve("deny");
        if (pending) settle(pending, "deny");
        return new Promise((resolve) => {
          const card = { id: "approval-" + (++seq), d, summary, content, detail, answered: null, context: context(), resolve };
          const key = result && typeof result === "object" ? result : loose;
          cards.set(key, (cards.get(key) || []).concat(card));
          pending = card;
          onChange();
        });
      },
      /** A card's own button: the waiting card only, once. */
      answer(id, choice) { return !!pending && pending.id === id && settle(pending, choice); },
      leave() { return settle(pending, "deny"); },
      /** Called now and then: the project changed under a waiting card → 「不同意」. */
      check() { return !!pending && pending.context !== context() && settle(pending, "deny"); },
      waiting() { return !!pending; },
      /** What the pane draws for a reply: its cards, the waiting one with its buttons, the answered ones as one line.
       *  say(key, vars) gives the words; projectName for 「改的是项目」. */
      view(result, say, projectName = "") {
        return ((result && cards.get(result)) || []).map((card) => {
          const d = card.d;
          return {
            id: card.id, kind: "approval", title: say("own.ap-title"),
            first: card.detail || d.label, second: card.detail ? d.label : "",
            // v7.2: what changes, the capability's sentence, the buttons. Only what the streamer must also know is added: where an
            // external step sends to, and that a step that can't be undone asks every time. (The summary and 「改的是项目」 said
            // the first line again; a card that does not fit the stream hides its own title.)
            more: [d.risk === "external" ? say("own.ap-sends-to", { domain: d.target }) : "", d.choices.includes("session") ? "" : say("own.ap-every-time")].filter(Boolean),
            content: card.content, contentLabel: say("own.ap-content"),
            actions: card.answered ? [] : ORDER.filter((c) => d.choices.includes(c)).map((c) => ({ id: c, label: say("own.ap-" + c), kind: c === "once" ? "primary" : c === "session" ? "secondary" : "plain" })),
            answered: card.answered ? say("own.ap-done-" + card.answered) : null,
          };
        });
      },
    };
  }
  return Object.freeze({ create, ORDER });
});
