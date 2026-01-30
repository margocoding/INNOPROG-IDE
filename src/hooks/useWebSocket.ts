import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { io, Socket } from "socket.io-client";
import { RoomPermissions } from "../types/room";
import { Language } from "../types/task";

interface UseWebSocketProps {
    socketUrl: string;
    myTelegramId: string;
    roomId: string | null;
}

export interface RoomMember {
    telegramId: string;
    online: boolean;
    isYourself: boolean;
    userColor?: string;
    username?: string;
}

export interface CursorData {
    telegramId: string;
    isYourself: boolean;
    position: [number, number];
    userColor: string;
    username?: string;
}

export const useWebSocket = ({
    socketUrl,
    myTelegramId,
    roomId,
}: UseWebSocketProps) => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isJoinedRoom, setIsJoinedRoom] = useState<boolean>(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
    const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());
    const [selections, setSelections] = useState<
        Map<
            string,
            {
                line?: number;
                column?: number;
                selectionStart?: { line: number; column: number };
                selectionEnd?: { line: number; column: number };
                selectedText?: string;
                userColor: string;
            }
        >
    >(new Map());
    const [codeEdits, setCodeEdits] = useState<Uint8Array[]>([]);
    const [myUserColor, setMyUserColor] = useState<string>("#FF6B6B");
    const [roomPermissions, setRoomPermissions] = useState<RoomPermissions>({
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
    });
    const [isTeacher, setIsTeacher] = useState<boolean | undefined>(undefined);
    const [completed, setCompleted] = useState<boolean>(false);
    const [language, setLanguage] = useState<Language | undefined>(undefined);
    const [joinedCode, setJoinedCode] = useState<string>('');

    const socketRef = useRef<Socket | null>(null);
    const socketUrlRef = useRef<string>(socketUrl);
    const myTelegramIdRef = useRef<string>(myTelegramId);
    const hasServerTelegramIdRef = useRef<boolean>(false);
    const selfIdsRef = useRef<Set<string>>(new Set());
    const roomIdRef = useRef(roomId);
    const isConnectedRef = useRef<boolean>(false);
    const shouldReconnectRef = useRef<boolean>(true);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const connectionAttempts = useRef<number>(0);
    const lastConnectionTime = useRef<number>(0);
    const maxRetriesBeforeError = useRef<number>(3);
    const isRemoteUpdate = useRef<boolean>(false);

    const [forceReconnectTrigger, setForceReconnectTrigger] = useState(0);


    const clearIntervals = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
        }
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
        }
    }, []);

    const joinRoom = useCallback(() => {
        if (!roomIdRef.current) {
            return;
        }

        if (socketRef.current?.connected) {
            const savedUsername = localStorage.getItem("innoprog-username");

            socketRef.current.emit("join-room", {
                telegramId: myTelegramIdRef.current,
                roomId: roomIdRef.current,
                username: savedUsername || undefined,
            });
        }
    }, []);

    const completeSession = useCallback(() => {
        if (completed) return;
        if (socketRef.current) {
            socketRef.current?.emit("close-session", {
                telegramId: myTelegramIdRef.current,
                roomId: roomIdRef.current,
            });
        }
    }, [completed]);

    const isSelfId = useCallback(
        (id?: string) => Boolean(id && selfIdsRef.current.has(id)),
        []
    );

    const connectWebSocket = useCallback(() => {
        const currentRoomId = roomIdRef.current;
        const currentSocketUrl = socketUrlRef.current;

        if (!currentRoomId) {
            setIsConnected(false);
            setIsJoinedRoom(false);
            return;
        }

        if (!shouldReconnectRef.current) return;

        const now = Date.now();
        const timeSinceLastConnection = now - lastConnectionTime.current;
        if (timeSinceLastConnection < 5000 && lastConnectionTime.current > 0)
            return;
        lastConnectionTime.current = now;

        if (socketRef.current && !socketRef.current.disconnected) {
            socketRef.current.close();
        }

        clearIntervals();

        let wsUrl;
        if (currentSocketUrl.startsWith("https://")) {
            wsUrl = currentSocketUrl.replace("https://", "wss://");
        } else if (currentSocketUrl.startsWith("http://")) {
            wsUrl = currentSocketUrl.replace("http://", "ws://");
        } else {
            wsUrl = `ws://${currentSocketUrl}`;
        }

        const socket = io(wsUrl, {
            transports: ["websocket"],
            reconnection: true,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
            setConnectionError(null);
            isConnectedRef.current = true;
            connectionAttempts.current = 0;

            setTimeout(joinRoom, 100);
        });

        socketRef.current?.on("disconnect", (reason) => {
            setIsConnected(false);
            setIsJoinedRoom(false);
            isConnectedRef.current = false;
            clearIntervals();

            if (shouldReconnectRef.current && currentRoomId) {
                connectionAttempts.current++;

                if (connectionAttempts.current > maxRetriesBeforeError.current) {
                    if (
                        reason !== "io client disconnect" &&
                        reason !== "io server disconnect"
                    ) {
                        setConnectionError("Не удается подключиться к серверу");
                    }
                } else {
                    setConnectionError(null);
                }

                const delay = 2000;
                reconnectTimeoutRef.current = setTimeout(() => {
                    socketRef.current?.disconnect();
                    socketRef.current = io("wss://your-server.com", {
                        transports: ["websocket"],
                        reconnection: false,
                    });
                    connectWebSocket();
                }, delay);
            }
        });

        socket.on("connect_error", (error) => {
            setIsConnected(false);

            isConnectedRef.current = false;
        });

        socket.on("joined", (eventData) => {
            setIsJoinedRoom(true);
            setCompleted(eventData.completed);
            setMyUserColor(eventData.userColor || "#FF6B6B");
            setIsTeacher(eventData.isTeacher);
            setLanguage(eventData.language);
            setJoinedCode(eventData.joinedCode);
            if (eventData.telegramId) {
                localStorage.setItem('telegramId', eventData.telegramId);
                hasServerTelegramIdRef.current = true;
                selfIdsRef.current.add(eventData.telegramId);
                myTelegramIdRef.current = eventData.telegramId;
            }

            if (eventData.roomPermissions) {
                setRoomPermissions(eventData.roomPermissions);
            }

            if (eventData.currentCursors) {
                setCursors(
                    new Map(
                        eventData.currentCursors
                            .filter((cursor: CursorData) => !isSelfId(cursor.telegramId))
                            .map((cursor: CursorData) => [cursor.telegramId, cursor])
                    )
                );
            }

            if (eventData.currentSelections) {
                const selectionsMap = new Map();
                eventData.currentSelections.forEach((selection: any) => {
                    if (selection.telegramId && !isSelfId(selection.telegramId)) {
                        selectionsMap.set(selection.telegramId, {
                            line: selection.line,
                            column: selection.column,
                            selectionStart: selection.selectionStart,
                            selectionEnd: selection.selectionEnd,
                            selectedText: selection.selectedText,
                            userColor: selection.userColor || "#FF6B6B",
                            username: selection.username,
                        });
                    }
                });
                setSelections(selectionsMap);
            }
        });
        socket.on("members-updated", (eventData) => {
            const members = eventData.members || [];
            const me = members.find((member: RoomMember) => member.telegramId === myTelegramIdRef.current);
            if (me && me.username) {
                localStorage.setItem('innoprog-username', me.username);
            }
            setRoomMembers(members);
        });

        socket.on("member-left", (eventData) => {
            if (!eventData.keepCursor) {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    newCursors.delete(eventData.telegramId);
                    return newCursors;
                });
            } else {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    const existingCursor = newCursors.get(eventData.telegramId);
                    if (existingCursor) {
                        newCursors.set(eventData.telegramId, {
                            ...existingCursor,
                            isOffline: true,
                        } as any);
                    }
                    return newCursors;
                });
            }

            setSelections((prev) => {
                const newSelections = new Map(prev);
                newSelections.delete(eventData.telegramId);
                return newSelections;
            });
        });

        socket.on("cursor-action", (eventData) => {
            if (eventData.telegramId && !isSelfId(eventData.telegramId)) {
                setCursors((prev) => {
                    const newCursors = new Map(prev);
                    newCursors.set(eventData.telegramId, {
                        telegramId: eventData.telegramId,
                        position: eventData.position,
                        userColor: eventData.userColor,
                        isYourself: eventData.isYourself,
                        username: eventData.username,
                    });
                    return newCursors;
                });
            }
        });

        socket.on("selection-state", (eventData) => {
            const newSelections = new Map();
            eventData.selections.forEach((selection: any) => {
                if (selection.telegramId && !isSelfId(selection.telegramId)) {
                    newSelections.set(selection.telegramId, {
                        line: selection.line,
                        column: selection.column,
                        selectionStart: selection.selectionStart,
                        selectionEnd: selection.selectionEnd,
                        selectedText: selection.selectedText,
                        userColor: selection.userColor || "#FF6B6B",
                        username: selection.username,
                    });
                }
            });

            setSelections(newSelections);
        });

        socket.on("complete-session", (eventData) => {
            toast(eventData.message);

            setTimeout(() => {
                const url = new URL(window.location.href);
                url.search = "";
                window.location.href = url.origin + url.pathname;
            }, 2000);
        });

        socket.on("code-edit-action", (eventData) => {
            setCodeEdits(eventData.update);
        });

        socket.on("room-edited", (eventData) => {
            if (
                eventData.studentCursorEnabled !== undefined &&
                eventData.studentSelectionEnabled !== undefined &&
                eventData.studentEditCodeEnabled !== undefined
            ) {
                if (!eventData.studentCursorEnabled) {
                    setCursors(new Map());
                } else if (!eventData.studentSelectionEnabled) {
                    setSelections(new Map());
                }
                setRoomPermissions({
                    studentCursorEnabled: eventData.studentCursorEnabled,
                    studentSelectionEnabled: eventData.studentSelectionEnabled,
                    studentEditCodeEnabled: eventData.studentEditCodeEnabled,
                });
                setLanguage(eventData.language);
            }
        });

        socket.on("room-state-loaded", (eventData) => {
            window.dispatchEvent(
                new CustomEvent("roomStateLoaded", {
                    detail: {
                        lastCode: eventData.lastCode,
                        participantCount: eventData.participantCount,
                    },
                })
            );
        });

        socket.on("clear-user-selections", (eventData) => {
            if (eventData.telegramId && !isSelfId(eventData.telegramId)) {
                setSelections((prev) => {
                    const newSelections = new Map(prev);
                    newSelections.delete(eventData.telegramId);
                    return newSelections;
                });
            }
        });

        socket.on("join-room:error", (eventData) => {
            setConnectionError(eventData.message);
        });
    }, [joinRoom, clearIntervals, isSelfId]);

    useEffect(() => {
        if (
            forceReconnectTrigger > 0 &&
            roomIdRef.current &&
            shouldReconnectRef.current
        ) {
            lastConnectionTime.current = 0;
            connectionAttempts.current = 0;
            setConnectionError(null);

            connectWebSocket();
        }
    }, [forceReconnectTrigger, connectWebSocket]);

    useEffect(() => {
        socketUrlRef.current = socketUrl;
        if (myTelegramId) {
            selfIdsRef.current.add(myTelegramId);
            if (!hasServerTelegramIdRef.current) {
                myTelegramIdRef.current = myTelegramId;
            }
        }
        const wasRoomId = roomIdRef.current;
        roomIdRef.current = roomId;

        if (wasRoomId !== roomId) {
            if (!roomId) {
                shouldReconnectRef.current = false;
                setIsConnected(false);
                setIsJoinedRoom(false);
                setConnectionError(null);
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
                if (pingIntervalRef.current) {
                    clearInterval(pingIntervalRef.current);
                    pingIntervalRef.current = null;
                }
                if (heartbeatTimeoutRef.current) {
                    clearTimeout(heartbeatTimeoutRef.current);
                    heartbeatTimeoutRef.current = null;
                }
                if (socketRef.current) {
                    socketRef.current.close();
                }
                return;
            }

            if (roomId) {
                shouldReconnectRef.current = true;
                setConnectionError(null);
                connectionAttempts.current = 0;

                if (
                    wasRoomId &&
                    isConnectedRef.current &&
                    socketRef.current?.connected
                ) {
                    const savedUsername = localStorage.getItem("innoprog-username");
                    socketRef.current.emit("join-room", {
                        telegramId: myTelegramIdRef.current,
                        roomId: roomId,
                        username: savedUsername || undefined,
                    });
                    return;
                }

                if (socketRef.current) {
                    socketRef.current.close();
                } else {
                    lastConnectionTime.current = 0;
                    connectionAttempts.current = 0;
                    setConnectionError(null);

                    setForceReconnectTrigger((prev) => prev + 1);
                }
                return;
            }
        }
    }, [socketUrl, myTelegramId, roomId]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        if (roomId) {
            setConnectionError(null);
            connectionAttempts.current = 0;
            lastConnectionTime.current = 0;
            connectWebSocket();
        }

        const handleBeforeUnload = () => {
            shouldReconnectRef.current = false;
            clearIntervals();
            if (socketRef.current) {
                socketRef.current.close();
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
            } else {
                if (
                    roomIdRef.current &&
                    !isConnectedRef.current &&
                    shouldReconnectRef.current
                ) {
                    setConnectionError(null);
                    connectionAttempts.current = 0;
                    lastConnectionTime.current = 0;
                    connectWebSocket();
                }
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            shouldReconnectRef.current = false;

            if (socketRef.current) {
                socketRef.current.close();
            }
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [roomId, connectWebSocket, clearIntervals]);

    const sendCursorPosition = useCallback(
        (position: [number, number]) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed && roomPermissions.studentCursorEnabled) {
                socketRef.current.emit("cursor", {
                    telegramId: myTelegramIdRef.current,
                    roomId: roomIdRef.current,
                    position,
                    logs: [],
                });
            }
        },
        [completed, roomPermissions.studentCursorEnabled]
    );

    const sendSelection = useCallback(
        (selectionData: {
            line?: number;
            column?: number;
            selectionStart?: { line: number; column: number };
            selectionEnd?: { line: number; column: number };
            selectedText?: string;
            clearSelection?: boolean;
        }) => {
            if (socketRef.current?.connected && roomIdRef.current && ((!completed && roomPermissions.studentSelectionEnabled) || isTeacher)) {
                socketRef.current.emit("selection", {
                    telegramId: myTelegramId,
                    roomId: roomIdRef.current,
                    ...selectionData,
                });
            }
        },
        [completed, roomPermissions.studentSelectionEnabled, isTeacher, myTelegramId]
    );

    const sendCodeEdit = useCallback(
        (update: Uint8Array) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed && (roomPermissions.studentEditCodeEnabled || isTeacher)) {
                socketRef.current.emit("code-edit", {
                    roomId: roomIdRef.current,
                    telegramId: myTelegramIdRef.current,
                    update,
                });
            }
        },
        [completed, roomPermissions.studentEditCodeEnabled, isTeacher]
    );


    const sendEditMember = useCallback(
        (username?: string, telegramId?: string) => {
            if (completed) return;
            if (socketRef.current?.connected && roomIdRef.current) {
                socketRef.current.emit("edit-member", {
                    changeTelegramId: telegramId || localStorage.getItem('telegramId'),
                    telegramId: myTelegramIdRef.current,
                    roomId: roomIdRef.current,
                    username,
                });
            }
        },
        [completed]
    );

    const sendChangeLanguage = useCallback((language: Language) => {
        if (socketRef.current?.connected && roomIdRef.current && !completed) {
            socketRef.current.emit('edit-room', {
                telegramId: myTelegramId,
                roomId: roomIdRef.current,
                language
            })
        }
    }, [completed, myTelegramId]);

    const sendRoomPermissions = useCallback(
        (permissions: RoomPermissions) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed) {
                socketRef.current.emit("edit-room", {
                    telegramId: myTelegramId,
                    roomId: roomIdRef.current,
                    ...permissions
                });
            }
        },
        [completed, myTelegramId]
    );

    return {
        socket: socketRef.current,
        isConnected,
        isJoinedRoom,
        roomMembers,
        cursors,
        selections,
        myUserColor,
        roomPermissions,
        isTeacher,
        sendCursorPosition,
        sendSelection,
        updatesFromProps: codeEdits,
        telegramId: myTelegramIdRef.current,
        onSendUpdate: sendCodeEdit,
        sendEditMember,
        sendRoomPermissions,
        connectionError,
        completeSession,
        completed,
        sendChangeLanguage,
        language,
        joinedCode,
        isRemoteUpdate
    };
};
