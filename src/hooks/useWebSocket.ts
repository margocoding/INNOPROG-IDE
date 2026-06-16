import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { io, Socket } from "socket.io-client";
import { RoomPermissions } from "../types/room";
import { Language } from "../types/task";

const REFERENCE_BLUE = "#518bff";
const MIN_CONTRAST_WITH_REFERENCE = 1.9;
const MIN_COLOR_DISTANCE = 95;

const hexToRgb = (hex: string): [number, number, number] => {
    const cleanHex = hex.replace("#", "");
    const fullHex =
        cleanHex.length === 3
            ? cleanHex
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : cleanHex;

    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);

    return [r, g, b];
};

const toLinear = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const contrastRatio = (firstHex: string, secondHex: string): number => {
    const firstLum = luminance(firstHex);
    const secondLum = luminance(secondHex);
    const lighter = Math.max(firstLum, secondLum);
    const darker = Math.min(firstLum, secondLum);
    return (lighter + 0.05) / (darker + 0.05);
};

const colorDistance = (firstHex: string, secondHex: string): number => {
    const [r1, g1, b1] = hexToRgb(firstHex);
    const [r2, g2, b2] = hexToRgb(secondHex);
    return Math.sqrt(
        Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
    );
};

const randomInt = (min: number, max: number): number => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const isRoomGeneratedTelegramId = (telegramId?: string | null): boolean =>
    Boolean(telegramId && /^i\d+$/.test(telegramId));

const hslToHex = (h: number, s: number, l: number): string => {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const huePrime = h / 60;
    const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;

    if (huePrime >= 0 && huePrime < 1) {
        r = chroma;
        g = x;
    } else if (huePrime < 2) {
        r = x;
        g = chroma;
    } else if (huePrime < 3) {
        g = chroma;
        b = x;
    } else if (huePrime < 4) {
        g = x;
        b = chroma;
    } else if (huePrime < 5) {
        r = x;
        b = chroma;
    } else {
        r = chroma;
        b = x;
    }

    const m = lightness - chroma / 2;
    const toHex = (value: number) =>
        Math.round((value + m) * 255)
            .toString(16)
            .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

interface UseWebSocketProps {
    socketUrl: string;
    myTelegramId?: string | null;
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
    const [codeEdits, setCodeEdits] = useState<unknown[]>([]);
    const [myUserColor, setMyUserColor] = useState<string>("#FF6B6B");
    const [roomPermissions, setRoomPermissions] = useState<RoomPermissions>({
        studentCursorEnabled: true,
        studentSelectionEnabled: true,
        studentEditCodeEnabled: true,
    });
    const [isTeacher, setIsTeacher] = useState<boolean | undefined>(undefined);
    const [completed, setCompleted] = useState<boolean>(false);
    const [language, setLanguage] = useState<Language | undefined>(undefined);
    const [joinedCode, setJoinedCode] = useState<string | undefined>(undefined);

    const socketRef = useRef<Socket | null>(null);
    const socketUrlRef = useRef<string>(socketUrl);
    const myTelegramIdRef = useRef<string>(myTelegramId || "");
    const assignedColorsRef = useRef<Map<string, string>>(new Map());
    const hasServerTelegramIdRef = useRef<boolean>(false);
    const hasAuthoritativeRoomTelegramIdRef = useRef<boolean>(false);
    const selfIdsRef = useRef<Set<string>>(new Set());
    const joinWithoutSavedIdTriedRef = useRef<boolean>(false);
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

    const joinRoom = useCallback((telegramIdOverride?: string | null) => {
        if (!roomIdRef.current) {
            return;
        }

        if (socketRef.current?.connected) {
            const savedUsername = localStorage.getItem("innoprog-username");
            const telegramId =
                telegramIdOverride === undefined
                    ? myTelegramIdRef.current
                    : telegramIdOverride;

            socketRef.current.emit("join-room", {
                telegramId: telegramId || undefined,
                roomId: roomIdRef.current,
                username: savedUsername || undefined,
            });
        }
    }, []);

    const getCurrentTelegramId = useCallback(
        () => myTelegramIdRef.current || myTelegramId || "",
        [myTelegramId]
    );

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

    const getOrAssignUserColor = useCallback((telegramId?: string): string => {
        if (!telegramId) {
            return "#FF6B6B";
        }

        if (selfIdsRef.current.has(telegramId)) {
            assignedColorsRef.current.set(telegramId, REFERENCE_BLUE);
            return REFERENCE_BLUE;
        }

        const existing = assignedColorsRef.current.get(telegramId);
        if (existing) {
            return existing;
        }

        const usedColors = Array.from(assignedColorsRef.current.values());
        let selectedColor = "#FF6B6B";

        for (let attempt = 0; attempt < 220; attempt++) {
            const candidateColor = hslToHex(
                randomInt(0, 359),
                randomInt(62, 90),
                randomInt(42, 64)
            );

            if (
                contrastRatio(candidateColor, REFERENCE_BLUE) <
                MIN_CONTRAST_WITH_REFERENCE
            ) {
                continue;
            }

            const isTooCloseToExisting = usedColors.some(
                (usedColor) =>
                    colorDistance(candidateColor, usedColor) < MIN_COLOR_DISTANCE
            );

            if (!isTooCloseToExisting) {
                selectedColor = candidateColor;
                break;
            }
        }

        if (
            contrastRatio(selectedColor, REFERENCE_BLUE) <
            MIN_CONTRAST_WITH_REFERENCE
        ) {
            const fallbackColors = [
                "#ff6b6b",
                "#22c55e",
                "#f59e0b",
                "#e11d48",
                "#06b6d4",
                "#a855f7",
                "#84cc16",
                "#ef4444",
                "#14b8a6",
                "#f97316",
            ];

            const availableFallback = fallbackColors.find(
                (fallback) =>
                    contrastRatio(fallback, REFERENCE_BLUE) >=
                        MIN_CONTRAST_WITH_REFERENCE &&
                    !usedColors.some(
                        (usedColor) =>
                            colorDistance(fallback, usedColor) <
                            MIN_COLOR_DISTANCE * 0.7
                    )
            );

            if (availableFallback) {
                selectedColor = availableFallback;
            }
        }

        assignedColorsRef.current.set(telegramId, selectedColor);
        return selectedColor;
    }, []);

    const enqueueCodeEdit = useCallback((update: unknown) => {
        const appendUpdate = (payload: unknown) => {
            setCodeEdits((prev) => [...prev, payload]);
        };

        if (typeof Blob !== "undefined" && update instanceof Blob) {
            update
                .arrayBuffer()
                .then((buffer) => {
                    appendUpdate(new Uint8Array(buffer));
                })
                .catch((error) => {
                    console.error("Failed to decode blob code update:", error);
                });
            return;
        }

        appendUpdate(update);
    }, []);

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
                    if (!shouldReconnectRef.current) {
                        return;
                    }

                    if (socketRef.current && !socketRef.current.disconnected) {
                        socketRef.current.close();
                    }

                    lastConnectionTime.current = 0;
                    connectWebSocket();
                }, delay);
            }
        });

        socket.on("connect_error", (error) => {
            setIsConnected(false);

            isConnectedRef.current = false;
        });

        socket.on("joined", (eventData) => {
            joinWithoutSavedIdTriedRef.current = false;
            setCodeEdits([]);
            setIsJoinedRoom(true);
            setConnectionError(null);
            setCompleted(eventData.completed);
            setIsTeacher(eventData.isTeacher);
            setLanguage(eventData.language);
            const initialRoomCode =
                typeof eventData.joinedCode === "string"
                    ? eventData.joinedCode
                    : typeof eventData.lastCode === "string"
                    ? eventData.lastCode
                    : undefined;
            setJoinedCode(initialRoomCode);
            if (eventData.telegramId) {
                const joinedTelegramId = String(eventData.telegramId);
                selfIdsRef.current.add(joinedTelegramId);
                hasServerTelegramIdRef.current = true;
                myTelegramIdRef.current = joinedTelegramId;

                if (isRoomGeneratedTelegramId(joinedTelegramId)) {
                    localStorage.setItem(
                        `innoprog-room-client-id:${roomIdRef.current}`,
                        joinedTelegramId
                    );
                } else {
                    if (roomIdRef.current) {
                        localStorage.removeItem(
                            `innoprog-room-client-id:${roomIdRef.current}`
                        );
                    }
                    localStorage.setItem("telegramId", joinedTelegramId);
                }
            }

            setMyUserColor(getOrAssignUserColor(myTelegramIdRef.current));

            if (eventData.roomPermissions) {
                setRoomPermissions(eventData.roomPermissions);
            }

            const cursorsEnabled =
                eventData.roomPermissions?.studentCursorEnabled !== false;

            if (eventData.currentCursors && cursorsEnabled) {
                setCursors(
                    new Map(
                        eventData.currentCursors
                            .filter((cursor: CursorData) => !isSelfId(cursor.telegramId))
                            .map((cursor: CursorData) => [
                                cursor.telegramId,
                                {
                                    ...cursor,
                                    userColor: getOrAssignUserColor(cursor.telegramId),
                                },
                            ])
                    )
                );
            } else if (!cursorsEnabled) {
                setCursors(new Map());
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
                            userColor: getOrAssignUserColor(selection.telegramId),
                            username: selection.username,
                        });
                    }
                });
                setSelections(selectionsMap);
            }
        });
        socket.on("members-updated", (eventData) => {
            const members = eventData.members || [];
            const currentTelegramId = myTelegramIdRef.current;
            const membersWithSelfFlag = members.map((member: RoomMember) => ({
                ...member,
                isYourself: member.telegramId === currentTelegramId,
                userColor: getOrAssignUserColor(member.telegramId),
            }));
            const me = membersWithSelfFlag.find((member: RoomMember) => member.isYourself);
            if (me && me.username) {
                localStorage.setItem("innoprog-username", me.username);
            }
            setRoomMembers(membersWithSelfFlag);
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
                        userColor: getOrAssignUserColor(eventData.telegramId),
                        isYourself: false,
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
                        userColor: getOrAssignUserColor(selection.telegramId),
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
            if (eventData?.telegramId && isSelfId(eventData.telegramId)) {
                return;
            }

            enqueueCodeEdit(eventData.update);
        });

        socket.on("room-edited", (eventData) => {
            const hasPermissionsUpdate =
                eventData.studentCursorEnabled !== undefined ||
                eventData.studentSelectionEnabled !== undefined ||
                eventData.studentEditCodeEnabled !== undefined;

            if (hasPermissionsUpdate) {
                if (eventData.studentCursorEnabled === false) {
                    setCursors(new Map());
                }
                if (eventData.studentSelectionEnabled === false) {
                    setSelections(new Map());
                }

                setRoomPermissions((prev) => ({
                    studentCursorEnabled:
                        eventData.studentCursorEnabled ?? prev.studentCursorEnabled,
                    studentSelectionEnabled:
                        eventData.studentSelectionEnabled ?? prev.studentSelectionEnabled,
                    studentEditCodeEnabled:
                        eventData.studentEditCodeEnabled ?? prev.studentEditCodeEnabled,
                }));
            }

            if (eventData.language) {
                setLanguage(eventData.language);
            }
        });

        socket.on("room-state-loaded", (eventData) => {
            if (typeof eventData.lastCode === "string") {
                setJoinedCode(eventData.lastCode);
            }

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
            if (hasAuthoritativeRoomTelegramIdRef.current) {
                setConnectionError(eventData.message);
                return;
            }

            if (!joinWithoutSavedIdTriedRef.current) {
                const staleRoomId = roomIdRef.current;
                if (staleRoomId) {
                    localStorage.removeItem(`innoprog-room-client-id:${staleRoomId}`);
                }

                if (isRoomGeneratedTelegramId(myTelegramIdRef.current)) {
                    selfIdsRef.current.delete(myTelegramIdRef.current);
                    myTelegramIdRef.current =
                        myTelegramId && !isRoomGeneratedTelegramId(myTelegramId)
                            ? myTelegramId
                            : "";
                }

                hasServerTelegramIdRef.current = false;
                joinWithoutSavedIdTriedRef.current = true;
                setConnectionError(null);
                joinRoom(null);
                return;
            }

            setConnectionError(eventData.message);
        });
    }, [joinRoom, clearIntervals, isSelfId, enqueueCodeEdit, getOrAssignUserColor, myTelegramId]);

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
        const wasRoomId = roomIdRef.current;
        const roomChanged = wasRoomId !== roomId;
        const hasAuthoritativeRoomTelegramId = Boolean(
            roomId && myTelegramId && !isRoomGeneratedTelegramId(myTelegramId)
        );
        hasAuthoritativeRoomTelegramIdRef.current = hasAuthoritativeRoomTelegramId;

        if (hasAuthoritativeRoomTelegramId && roomId) {
            localStorage.removeItem(`innoprog-room-client-id:${roomId}`);
        }

        if (roomChanged) {
            hasServerTelegramIdRef.current = false;
            selfIdsRef.current.clear();
            myTelegramIdRef.current = myTelegramId || "";
        }

        if (myTelegramId) {
            selfIdsRef.current.add(myTelegramId);
            if (!hasServerTelegramIdRef.current || hasAuthoritativeRoomTelegramId) {
                myTelegramIdRef.current = myTelegramId;
            }
            setMyUserColor(getOrAssignUserColor(myTelegramIdRef.current));
        }
        roomIdRef.current = roomId;

        if (roomChanged) {
            joinWithoutSavedIdTriedRef.current = false;
            setJoinedCode(undefined);
            setCodeEdits([]);
            assignedColorsRef.current.clear();
            if (!roomId) {
                shouldReconnectRef.current = false;
                setIsConnected(false);
                setIsJoinedRoom(false);
                setConnectionError(null);
                setMyUserColor("#FF6B6B");
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

        if (
            !roomChanged &&
            hasAuthoritativeRoomTelegramId &&
            socketRef.current?.connected
        ) {
            hasServerTelegramIdRef.current = false;
            joinWithoutSavedIdTriedRef.current = false;
            setConnectionError(null);
            joinRoom(myTelegramId);
        }
    }, [socketUrl, myTelegramId, roomId, getOrAssignUserColor, joinRoom]);

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

        const syncOnActiveTab = () => {
            if (!roomIdRef.current || !shouldReconnectRef.current) {
                return;
            }

            if (socketRef.current?.connected) {
                setConnectionError(null);
                connectionAttempts.current = 0;
                joinRoom();
                return;
            }

            if (!isConnectedRef.current) {
                setConnectionError(null);
                connectionAttempts.current = 0;
                lastConnectionTime.current = 0;
                connectWebSocket();
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                return;
            }

            syncOnActiveTab();
        };

        const handleWindowFocus = () => {
            syncOnActiveTab();
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleWindowFocus);

        return () => {
            shouldReconnectRef.current = false;

            if (socketRef.current) {
                socketRef.current.close();
            }
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [roomId, connectWebSocket, clearIntervals, joinRoom]);

    const sendCursorPosition = useCallback(
        (position: [number, number]) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed && roomPermissions.studentCursorEnabled) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("cursor", {
                    telegramId,
                    roomId: roomIdRef.current,
                    position,
                    logs: [],
                });
            }
        },
        [completed, roomPermissions.studentCursorEnabled, getCurrentTelegramId]
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
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("selection", {
                    telegramId,
                    roomId: roomIdRef.current,
                    ...selectionData,
                });
            }
        },
        [completed, roomPermissions.studentSelectionEnabled, isTeacher, getCurrentTelegramId]
    );

    const sendCodeEdit = useCallback(
        (update: Uint8Array) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed && (roomPermissions.studentEditCodeEnabled || isTeacher)) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("code-edit", {
                    roomId: roomIdRef.current,
                    telegramId,
                    update,
                });
            }
        },
        [completed, roomPermissions.studentEditCodeEnabled, isTeacher, getCurrentTelegramId]
    );


    const sendEditMember = useCallback(
        (username?: string, telegramId?: string) => {
            if (completed) return;
            if (socketRef.current?.connected && roomIdRef.current) {
                const currentTelegramId = getCurrentTelegramId();
                if (!currentTelegramId) return;

                socketRef.current.emit("edit-member", {
                    changeTelegramId: telegramId || currentTelegramId,
                    telegramId: currentTelegramId,
                    roomId: roomIdRef.current,
                    username,
                });
            }
        },
        [completed, getCurrentTelegramId]
    );

    const sendChangeLanguage = useCallback((language: Language) => {
        if (socketRef.current?.connected && roomIdRef.current && !completed) {
            const telegramId = getCurrentTelegramId();
            if (!telegramId) return;

            socketRef.current.emit('edit-room', {
                telegramId,
                roomId: roomIdRef.current,
                language
            })
        }
    }, [completed, getCurrentTelegramId]);

    const sendRoomPermissions = useCallback(
        (permissions: RoomPermissions) => {
            if (socketRef.current?.connected && roomIdRef.current && !completed) {
                const telegramId = getCurrentTelegramId();
                if (!telegramId) return;

                socketRef.current.emit("edit-room", {
                    telegramId,
                    roomId: roomIdRef.current,
                    ...permissions
                });
            }
        },
        [completed, getCurrentTelegramId]
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
