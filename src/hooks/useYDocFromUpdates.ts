import * as Y from 'yjs';
import React from 'react';

interface UseYDocOptions {
    updates?: Uint8Array[];
    isRemoteUpdate?: React.MutableRefObject<boolean>;
};

const useYDocFromUpdates = ({ updates, isRemoteUpdate }: UseYDocOptions) => {
    const [ydoc] = React.useState(() => new Y.Doc());


    React.useEffect(() => {
        if (!updates || updates.length === 0) return;

        try {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = true;
            }
            const updatesArray = Array.isArray(updates) ? updates : [updates];

            for (const update of updatesArray) {
                Y.applyUpdate(ydoc, new Uint8Array(update));
            }
        } catch (e) {
            console.error('Failed to apply updates:', e);
        } finally {
            if (isRemoteUpdate) {
                isRemoteUpdate.current = false;
            }
        }
    }, [updates, ydoc, isRemoteUpdate]);

    React.useEffect(() => {
        return () => {
            ydoc.destroy();
        };
    }, [ydoc]);

    return ydoc;
};

export default useYDocFromUpdates;
