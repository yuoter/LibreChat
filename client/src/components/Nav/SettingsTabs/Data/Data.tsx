import React, { useState, useRef } from 'react';
import { useOnClickOutside } from '@librechat/client';
import ImportConversations from './ImportConversations';
import { RevokeKeys } from './RevokeKeys';
import { DeleteCache } from './DeleteCache';
import { ClearChats } from './ClearChats';
import SharedLinks from './SharedLinks';

function Data() {
  // Hardcoded feature flag to control visibility
  const RevokeKeysOptionShow = false;
  const ImportConversationsOptionShow = false;
  //end of a hardcoded feature flag to control visibility 



  const dataTabRef = useRef(null);
  const [confirmClearConvos, setConfirmClearConvos] = useState(false);
  useOnClickOutside(dataTabRef, () => confirmClearConvos && setConfirmClearConvos(false), []);

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      {ImportConversationsOptionShow && (
        <div className="pb-3">
          <ImportConversations />
        </div>
      )}
      <div className="pb-3">
        <SharedLinks />
      </div>
      {RevokeKeysOptionShow && (
        <div className="pb-3">
          <RevokeKeys />
        </div>
      )}
      <div className="pb-3">
        <DeleteCache />
      </div>
      <div className="pb-3">
        <ClearChats />
      </div>
    </div>
  );
}

export default React.memo(Data);
