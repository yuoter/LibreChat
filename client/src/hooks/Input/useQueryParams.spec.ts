// useQueryParams.spec.ts

jest.mock('recoil', () => {
  const originalModule = jest.requireActual('recoil');
  return {
    ...originalModule,
    atom: jest.fn().mockImplementation((config) => ({
      key: config.key,
      default: config.default,
    })),
    useRecoilValue: jest.fn(),
  };
});

// mock store atoms/selectors
jest.mock('~/store', () => ({
  modularChat: { key: 'modularChat', default: false },
  availableTools: { key: 'availableTools', default: [] },
}));

// mock react-router hooks
jest.mock('react-router-dom', () => ({
  useSearchParams: jest.fn(),
}));

// mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
  useQuery: jest.fn(),
}));

// mock Providers
jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(),
}));

/**
 * NEW consolidated hooks mock
 */
jest.mock('~/hooks', () => ({
  __esModule: true,
  useAuthContext: jest.fn(),
  useAgentsMap: jest.fn(),
  useDefaultConvo: jest.fn(),
  useSubmitMessage: jest.fn(),
  useGetAgentsConfig: jest.fn(),
}));

// mock utils
jest.mock('~/utils', () => ({
  getConvoSwitchLogic: jest.fn(() => ({
    template: {},
    shouldSwitch: false,
    isNewModular: false,
    newEndpointType: null,
    isCurrentModular: false,
    isExistingConversation: false,
  })),
  getModelSpecIconURL: jest.fn(() => 'icon-url'),
  removeUnavailableTools: jest.fn((preset) => preset),
  logger: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getInitialTheme: jest.fn(() => 'light'),
  applyFontSize: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  tQueryParamsSchema: {
    shape: {
      model: { parse: jest.fn((value) => value) },
      endpoint: { parse: jest.fn((value) => value) },
      temperature: { parse: jest.fn((value) => value) },
    },
  },
  isAgentsEndpoint: jest.fn(() => false),
  isAssistantsEndpoint: jest.fn(() => false),
  QueryKeys: {
    startupConfig: 'startupConfig',
    endpoints: 'endpoints',
  },
  EModelEndpoint: {
    custom: 'custom',
    assistants: 'assistants',
    agents: 'agents',
  },
  SystemRoles: {
    ADMIN: 'admin',
    USER: 'user',
  },
}));

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useListAgentsQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useGetEndpointsQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

import { renderHook, act } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';

import useQueryParams from './useQueryParams';
import { useChatContext, useChatFormContext } from '~/Providers';
import store from '~/store';

describe('useQueryParams', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    // stub out window.history
    global.window = Object.create(window);
    global.window.history = {
      replaceState: jest.fn(),
      pushState: jest.fn(),
      go: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      length: 1,
      scrollRestoration: 'auto',
      state: null,
    };
    jest.spyOn(window.history, 'replaceState').mockClear();

    const hooks = jest.requireMock('~/hooks');

    // defaultAgent + normal user role => urlAgentId is truthy, guard passes
    (hooks.useGetAgentsConfig as jest.Mock).mockReturnValue({
      agentsConfig: { defaultAgent: 'agent-123' },
    });

    (hooks.useAuthContext as jest.Mock).mockReturnValue({
      user: { id: 'test-user-id', role: 'user' },
      isAuthenticated: true,
    });

    (hooks.useAgentsMap as jest.Mock).mockReturnValue({});

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: jest.fn(),
    });

    (hooks.useDefaultConvo as jest.Mock).mockReturnValue(jest.fn().mockReturnValue({}));

    const mockSearchParams = new URLSearchParams();
    (useSearchParams as jest.Mock).mockReturnValue([mockSearchParams, jest.fn()]);

    const mockQueryClient = {
      getQueryData: jest.fn().mockImplementation((key) => {
        if (
          key === 'startupConfig' ||
          (Array.isArray(key) && key[0] === 'startupConfig')
        ) {
          return { modelSpecs: { list: [] } };
        }
        if (
          key === 'endpoints' ||
          (Array.isArray(key) && key[0] === 'endpoints')
        ) {
          return {};
        }
        return null;
      }),
    };
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);

    (useRecoilValue as jest.Mock).mockImplementation((atom) => {
      if (atom === store.modularChat) return false;
      if (atom === store.availableTools) return [];
      return null;
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { model: null, endpoint: null },
      newConversation: jest.fn(),
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: jest.fn(),
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: jest.fn((callback) => () => callback({ text: 'test message' })),
    });

    const dataProvider = jest.requireMock('~/data-provider');
    (dataProvider.useGetAgentByIdQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // helper to override URL params in each test
  const setUrlParams = (params: Record<string, string>) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      sp.set(key, value);
    });
    (useSearchParams as jest.Mock).mockReturnValue([sp, jest.fn()]);
  };

  it('should process query parameters on initial render (no submit param)', () => {
    const hooks = jest.requireMock('~/hooks');

    const mockSetValue = jest.fn();
    const mockHandleSubmit = jest.fn((cb) => () => cb({ text: 'test message' }));
    const mockSubmitMessage = jest.fn();

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: mockHandleSubmit,
    });

    setUrlParams({ q: 'hello world' });

    const mockTextAreaRef = {
      current: {
        focus: jest.fn(),
        setSelectionRange: jest.fn(),
      },
    } as unknown as { current: HTMLTextAreaElement };

    renderHook(() => useQueryParams({ textAreaRef: mockTextAreaRef }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSetValue).toHaveBeenCalledWith(
      'text',
      'hello world',
      expect.objectContaining({ shouldValidate: true }),
    );
    expect(mockHandleSubmit).not.toHaveBeenCalled();
    expect(mockSubmitMessage).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it('defers auto-submit when submit=true and submits after timeout if settings never fully apply', () => {
    const hooks = jest.requireMock('~/hooks');

    const mockSetValue = jest.fn();
    const mockHandleSubmit = jest.fn((cb) => () => cb({ text: 'test message' }));
    const mockSubmitMessage = jest.fn();

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: mockHandleSubmit,
    });

    setUrlParams({ q: 'hello world', submit: 'true' });

    const mockTextAreaRef = {
      current: {
        focus: jest.fn(),
        setSelectionRange: jest.fn(),
      },
    } as unknown as { current: HTMLTextAreaElement };

    renderHook(() => useQueryParams({ textAreaRef: mockTextAreaRef }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSubmitMessage).not.toHaveBeenCalled();
    expect(mockHandleSubmit).not.toHaveBeenCalled();
    expect(mockSetValue).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockSetValue).toHaveBeenCalledWith(
      'text',
      'hello world',
      expect.objectContaining({ shouldValidate: true }),
    );
    expect(mockHandleSubmit).toHaveBeenCalled();
    expect(mockSubmitMessage).toHaveBeenCalled();
  });

  it('submits early once conversation reflects requested settings (no timeout needed)', () => {
    const hooks = jest.requireMock('~/hooks');

    const mockSetValue = jest.fn();
    const mockHandleSubmit = jest.fn((cb) => () => cb({ text: 'test message' }));
    const mockSubmitMessage = jest.fn();
    const mockNewConversation = jest.fn();

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: mockHandleSubmit,
    });

    setUrlParams({ q: 'hello world', submit: 'true', model: 'gpt-4' });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { model: null, endpoint: null },
      newConversation: mockNewConversation,
    });

    const mockTextAreaRef = {
      current: {
        focus: jest.fn(),
        setSelectionRange: jest.fn(),
      },
    } as unknown as { current: HTMLTextAreaElement };

    const { rerender } = renderHook(() => useQueryParams({ textAreaRef: mockTextAreaRef }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSubmitMessage).not.toHaveBeenCalled();

    // Now simulate convo state matches requested settings
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: {
        model: 'gpt-4',
        endpoint: 'agents',
        agent_id: 'agent-123',
      },
      newConversation: mockNewConversation,
    });

    rerender();

    expect(mockSetValue).toHaveBeenCalledWith(
      'text',
      'hello world',
      expect.objectContaining({ shouldValidate: true }),
    );
    expect(mockHandleSubmit).toHaveBeenCalled();
    expect(mockSubmitMessage).toHaveBeenCalled();
  });

  it('marks submission as handled when no submit parameter is present (and never auto-submits later)', () => {
    const hooks = jest.requireMock('~/hooks');

    const mockSetValue = jest.fn();
    const mockHandleSubmit = jest.fn((cb) => () => cb({ text: 'test message' }));
    const mockSubmitMessage = jest.fn();

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: mockHandleSubmit,
    });

    setUrlParams({ model: 'gpt-4' }); // no q, no submit=true

    const mockTextAreaRef = {
      current: {
        focus: jest.fn(),
        setSelectionRange: jest.fn(),
      },
    } as unknown as { current: HTMLTextAreaElement };

    renderHook(() => useQueryParams({ textAreaRef: mockTextAreaRef }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockHandleSubmit).not.toHaveBeenCalled();
    expect(mockSubmitMessage).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(mockSubmitMessage).not.toHaveBeenCalled();
  });

  it('handles empty query parameters safely', () => {
    const hooks = jest.requireMock('~/hooks');

    const mockSetValue = jest.fn();
    const mockHandleSubmit = jest.fn();
    const mockSubmitMessage = jest.fn();

    (hooks.useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: mockSubmitMessage,
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      setValue: mockSetValue,
      getValues: jest.fn().mockReturnValue(''),
      handleSubmit: mockHandleSubmit,
    });

    setUrlParams({}); // no params

    const mockTextAreaRef = {
      current: {
        focus: jest.fn(),
        setSelectionRange: jest.fn(),
      },
    } as unknown as { current: HTMLTextAreaElement };

    renderHook(() => useQueryParams({ textAreaRef: mockTextAreaRef }));

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockHandleSubmit).not.toHaveBeenCalled();
    expect(mockSubmitMessage).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalled();
  });
});
