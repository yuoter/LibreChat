import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants, EModelEndpoint, SystemRoles } from 'librechat-data-provider';
import { TooltipAnchor, NewChatIcon, MobileSidebar, Sidebar, Button } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize, useNewConvo, useGetAgentsConfig, useAuthContext } from '~/hooks';
import store from '~/store';

export default function NewChat({
  index = 0,
  toggleNav,
  subHeaders,
  isSmallScreen,
  headerButtons,
}: {
  index?: number;
  toggleNav: () => void;
  isSmallScreen?: boolean;
  subHeaders?: React.ReactNode;
  headerButtons?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(index);
  const navigate = useNavigate();
  const localize = useLocalize();
  const { conversation } = store.useCreateConversationAtom(index);
  const { agentsConfig } = useGetAgentsConfig();
  const { user } = useAuthContext();

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
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
        newConvo({
          preset: {
            endpoint: EModelEndpoint.agents,
            agent_id: defaultAgent,
          },
        });
      } else {
        // Create generic new conversation
        newConvo();
      }

      navigate('/c/new', { state: { focusChat: true } });
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [queryClient, conversation, newConvo, navigate, toggleNav, isSmallScreen, agentsConfig, user],
  );

  return (
    <>
      <div className="flex items-center justify-between py-[2px] md:py-2">
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              size="icon"
              variant="outline"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
              onClick={toggleNav}
            >
              <Sidebar className="max-md:hidden" />
              <MobileSidebar className="m-1 inline-flex size-10 items-center justify-center md:hidden" />
            </Button>
          }
        />
        <div className="flex gap-0.5">
          {headerButtons}

          <TooltipAnchor
            description={localize('com_ui_new_chat')}
            render={
              <Button
                size="icon"
                variant="outline"
                data-testid="nav-new-chat-button"
                aria-label={localize('com_ui_new_chat')}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={clickHandler}
              >
                <NewChatIcon className="icon-lg text-text-primary" />
              </Button>
            }
          />
        </div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
