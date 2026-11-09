// Missing/unknown modes retain the original behavior. Existing switches win.
export function isManualStatusMode(settings) {
  return settings.status_enabled === true &&
    settings.update_management?.panel_enabled === true &&
    settings.update_management?.update_mode === "manual";
}

export function matchesConfiguredStatusEnd(text, settings) {
  const body = String(text ?? "").trimEnd();
  const tags = String(settings.update_management?.stop_sequence ?? "")
    .split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
  return body.length > 0 && tags.some(tag => body.endsWith(tag));
}

function sameReply(a, b) {
  return a?.chatId === b?.chatId && a?.messageId === b?.messageId &&
    a?.swipeId === b?.swipeId && a?.text === b?.text;
}

// The original auto-stop script writes its trimmed text via setChatMessages,
// which emits CHARACTER_MESSAGE_RENDERED again. Check the final stored reply
// after end/render settles, without requiring a custom script notification.
export function createStoppedStatusWatcher({ getSnapshot, getSettings, onReady,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let before = null, stoppedAt = null;
  let started = false, stopped = false, ended = false, delivered = false;
  let timer = null;
  function reset() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    before = stoppedAt = null;
    started = stopped = ended = delivered = false;
  }
  function schedule() {
    if (!started || !stopped || !ended || delivered) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      const settings = getSettings();
      if (!isManualStatusMode(settings)) return;
      const current = getSnapshot();
      if (!current?.chatId || current.role !== "assistant" ||
          current.chatId !== before?.chatId ||
          current.chatId !== stoppedAt?.chatId ||
          current.messageId !== stoppedAt?.messageId ||
          current.swipeId !== stoppedAt?.swipeId ||
          sameReply(before, current) ||
          !matchesConfiguredStatusEnd(current.text, settings)) return;
      delivered = true;
      onReady(current);
    }, 50);
  }
  return {
    reset,
    start() { reset(); before = getSnapshot(); started = true; },
    stop() { if (started) { stopped = true; stoppedAt = getSnapshot(); schedule(); } },
    end() { if (started) { ended = true; schedule(); } },
    render: schedule,
  };
}

export function matchesStatusReply(detail, context, message) {
  return !!detail && detail.chatId === context.chatId &&
    Number.isInteger(detail.messageId) && message?.message_id === detail.messageId &&
    message.role === "assistant" && message.is_user !== true &&
    typeof detail.text === "string" && detail.text.trim().length > 0 &&
    message.message === detail.text &&
    (context.chat?.[detail.messageId]?.swipe_id ?? 0) === detail.swipeId;
}
