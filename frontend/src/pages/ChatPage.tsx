import { ChatArea } from '../components/Chat/ChatArea';
import { SystemPanel } from '../components/Chat/SystemPanel';
import { useAppStore } from '../lib/store';

export function ChatPage() {
  const systemPanelOpen = useAppStore((s) => s.systemPanelOpen);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0">
        <ChatArea />
      </div>
      {/* Metrics are supplementary: at phone widths the panel would take half
          the screen and squeeze the conversation, so it only shows from md up. */}
      {systemPanelOpen && (
        <div className="hidden md:block">
          <SystemPanel />
        </div>
      )}
    </div>
  );
}
