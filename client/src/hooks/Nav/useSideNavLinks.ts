import { useMemo } from 'react';
import { Blocks, MCPIcon, AttachmentIcon } from '@librechat/client';
import { Database, Bookmark, Settings2, ArrowRightToLine, MessageSquareQuote } from 'lucide-react';
import {
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  isParamEndpoint,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import MemoryViewer from '~/components/SidePanel/Memories/MemoryViewer';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
import PromptsAccordion from '~/components/Prompts/PromptsAccordion';
import Parameters from '~/components/SidePanel/Parameters/Panel';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import MCPPanel from '~/components/SidePanel/MCP/MCPPanel';
import { useGetStartupConfig } from '~/data-provider';
import { useHasAccess, useAuthContext } from '~/hooks';

export default function useSideNavLinks({
  hidePanel,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
  endpointsConfig,
}: {
  hidePanel: () => void;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
  endpointsConfig: TEndpointsConfig;
}) {
  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.USE,
  });
  const hasAccessToReadMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });
  const { data: startupConfig } = useGetStartupConfig();
  const { user } = useAuthContext();

  const Links = useMemo(() => {
    const links: NavLink[] = [];
    if (
      isAssistantsEndpoint(endpoint) &&
      ((endpoint === EModelEndpoint.assistants &&
        endpointsConfig?.[EModelEndpoint.assistants] &&
        endpointsConfig[EModelEndpoint.assistants].disableBuilder !== true) ||
        (endpoint === EModelEndpoint.azureAssistants &&
          endpointsConfig?.[EModelEndpoint.azureAssistants] &&
          endpointsConfig[EModelEndpoint.azureAssistants].disableBuilder !== true)) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: EModelEndpoint.assistants,
        Component: PanelSwitch,
      });
    }

    if (
      endpointsConfig?.[EModelEndpoint.agents] &&
      hasAccessToAgents &&
      endpointsConfig[EModelEndpoint.agents].disableBuilder !== true
    ) {
      const agentsConfig = endpointsConfig[EModelEndpoint.agents];
      const agentsAdminObjectId = agentsConfig.agentsAdminObjectId;

      console.log('[useSideNavLinks] Checking Agent Builder panel visibility:', {
        currentUserId: user?.id || 'not authenticated',
        agentsAdminObjectId: agentsAdminObjectId || 'not set',
        hasAccessToAgents,
        hasAccessToCreateAgents,
        disableBuilder: agentsConfig.disableBuilder,
      });

      // If agentsAdminObjectId is set, only show Agent Builder to that specific user
      // Otherwise, show to all users with CREATE permission
      const canAccessBuilder = agentsAdminObjectId
        ? user?.id === agentsAdminObjectId
        : hasAccessToCreateAgents;

      if (agentsAdminObjectId) {
        const isAdminUser = user?.id === agentsAdminObjectId;
        console.log(
          `[useSideNavLinks] Agent Builder restricted mode: ${isAdminUser ? 'USER IS ADMIN' : 'USER IS NOT ADMIN'}`,
          {
            matches: isAdminUser,
            currentUserId: user?.id,
            requiredUserId: agentsAdminObjectId,
          },
        );
      } else {
        console.log('[useSideNavLinks] Agent Builder open mode: checking CREATE permission', {
          hasCreatePermission: hasAccessToCreateAgents,
        });
      }

      if (canAccessBuilder) {
        console.log('[useSideNavLinks] ✓ Agent Builder panel will be shown to this user');
        links.push({
          title: 'com_sidepanel_agent_builder',
          label: '',
          icon: Blocks,
          id: EModelEndpoint.agents,
          Component: AgentPanelSwitch,
        });
      } else {
        console.log('[useSideNavLinks] ✗ Agent Builder panel will be hidden from this user');
      }
    }

    if (hasAccessToPrompts) {
      links.push({
        title: 'com_ui_prompts',
        label: '',
        icon: MessageSquareQuote,
        id: 'prompts',
        Component: PromptsAccordion,
      });
    }

    if (hasAccessToMemories && hasAccessToReadMemories) {
      links.push({
        title: 'com_ui_memories',
        label: '',
        icon: Database,
        id: 'memories',
        Component: MemoryViewer,
      });
    }

    if (
      interfaceConfig.parameters === true &&
      isParamEndpoint(endpoint ?? '', endpointType ?? '') === true &&
      !isAgentsEndpoint(endpoint) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_parameters',
        label: '',
        icon: Settings2,
        id: 'parameters',
        Component: Parameters,
      });
    }

    if (interfaceConfig.attachFiles === true) {
      links.push({
        title: 'com_sidepanel_attach_files',
        label: '',
        icon: AttachmentIcon,
        id: 'files',
        Component: FilesPanel,
      });
    }

    if (hasAccessToBookmarks) {
      links.push({
        title: 'com_sidepanel_conversation_tags',
        label: '',
        icon: Bookmark,
        id: 'bookmarks',
        Component: BookmarkPanel,
      });
    }

    if (
      startupConfig?.mcpServers &&
      Object.values(startupConfig.mcpServers).some(
        (server: any) =>
          (server.customUserVars && Object.keys(server.customUserVars).length > 0) ||
          server.isOAuth ||
          server.startup === false,
      )
    ) {
      links.push({
        title: 'com_nav_setting_mcp',
        label: '',
        icon: MCPIcon,
        id: 'mcp-settings',
        Component: MCPPanel,
      });
    }

    links.push({
      title: 'com_sidepanel_hide_panel',
      label: '',
      icon: ArrowRightToLine,
      onClick: hidePanel,
      id: 'hide-panel',
    });

    return links;
  }, [
    endpointsConfig,
    interfaceConfig.parameters,
    keyProvided,
    endpointType,
    endpoint,
    hasAccessToAgents,
    hasAccessToPrompts,
    hasAccessToMemories,
    hasAccessToReadMemories,
    hasAccessToBookmarks,
    hasAccessToCreateAgents,
    hidePanel,
    startupConfig,
    user,
  ]);

  return Links;
}
