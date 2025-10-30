import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants, EModelEndpoint, SystemRoles } from 'librechat-data-provider';
import { TooltipAnchor, Button, NewChatIcon } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize, useGetAgentsConfig, useAuthContext } from '~/hooks';

export default function HeaderNewChat() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { conversation, newConversation } = useChatContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { user } = useAuthContext();

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
      [],
    );
    queryClient.invalidateQueries([QueryKeys.messages]);

    // Check if we should use default agent for USER role
    const defaultAgent = agentsConfig?.defaultAgent ?? '';
    const shouldUseDefaultAgent =
      user?.role === SystemRoles.USER && defaultAgent && defaultAgent !== '';

    if (shouldUseDefaultAgent) {
      // Create new conversation with default agent
      newConversation({
        preset: {
          endpoint: EModelEndpoint.agents,
          agent_id: defaultAgent,
        },
      });
    } else {
      // Create generic new conversation
      newConversation();
    }
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_new_chat')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="wide-header-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover max-md:hidden"
          onClick={clickHandler}
        >
          <NewChatIcon />
        </Button>
      }
    />
  );
}
