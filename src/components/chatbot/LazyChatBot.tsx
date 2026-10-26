import dynamic from "next/dynamic";

// Chat is a secondary action on pages that mount it. Keep speech, navigation
// and response-rendering code in a separate chunk so each page can paint its
// primary content before the assistant bundle is requested.
export const LazyChatBot = dynamic(
  () => import("@/components/ChatBot").then((module) => module.ChatBot),
  { ssr: false, loading: () => null },
);
