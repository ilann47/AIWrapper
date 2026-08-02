// Direct runtime exports from Traycer. AIWrapper supplies DOM/session adapters;
// the mature highlight and rate-limit tone algorithms remain upstream code.
export {
  ChatFindHighlighter,
  queryMountedChatFindUnit,
} from "../../../upstream/traycer/clients/gui-app/src/components/chat/chat-find-highlighter";
export {
  contextUsageTone,
  formatContextWindowTokens,
} from "../../../upstream/traycer/clients/gui-app/src/components/chat/context-usage";
