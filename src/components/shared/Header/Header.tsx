import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  useDisclosure,
} from "@heroui/react";
import React from "react";
import { isDesktop } from "../../..";
import { RoomPermissions } from "../../../types/room";
import Settings from "../Room/Settings/Settings";
import { RoomMember } from "../../../hooks/useWebSocket";
import StartFormModal from "../Room/StartFormModal/StartFormModal";

interface IProps {
  members?: RoomMember[];
  onEditMember?: (username?: string, telegramId?: string) => void;
  onCompleteSession?: () => void;
  myTelegramId?: string;
  roomPermissions?: RoomPermissions;
  isTeacher?: boolean;
  onPermissionsChange?: (permissions: RoomPermissions) => void;
  roomId?: string | null;
  completedSession?: boolean;
}

const Header: React.FC<IProps> = ({
  members,
  onEditMember,
  myTelegramId,
  roomPermissions,
  isTeacher = false,
  onPermissionsChange,
  roomId,
  onCompleteSession,
  completedSession,
}) => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editingMember, setEditingMember] = React.useState<RoomMember | null>(
    null
  );
  const [showMembersCard, setShowMembersCard] = React.useState<boolean>(false);

  // Закрываем карточки при клике вне их

  const handleMemberClick = (member: RoomMember) => {
    // Разрешаем редактировать только свой профиль
    if (member.telegramId === myTelegramId || isTeacher) {
      setEditingMember(member);
      onOpen();
    }
  };

  const handleEditSubmit = (username?: string) => {
    if (onEditMember) {
      onEditMember(username, editingMember?.telegramId);
    }
    setEditingMember(null);
  };

  // Функции для работы с участниками
  const sortedMembers = React.useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => {
      // Сначала онлайн, потом оффлайн
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }
      // Внутри каждой группы сортируем по имени
      const nameA = a.username || a.telegramId;
      const nameB = b.username || b.telegramId;
      return nameA.localeCompare(nameB);
    });
  }, [members]);

  const onlineMembers = sortedMembers.filter((member) => member.online);
  const visibleMembers = onlineMembers.slice(0, 3);
  const hasMoreMembers = sortedMembers.length > 1;

    if (!isDesktop() && Object.entries(window?.Telegram?.WebApp.initDataUnsafe).length) {
        console.log(window?.Telegram?.WebApp.initDataUnsafe);
        try {
            window.Telegram.WebApp.expand();
            window.Telegram.WebApp.requestFullscreen();
        } catch (e) {
            console.error(e);
        }

        return <header className={'mt-[75px]'}></header>
    }

  return (
    <>
      <header className="bg-ide-secondary border-b border-ide-border flex items-center justify-between relative px-4 md:px-6">
        {/* Логотип с отступами */}
        <div className="flex-shrink-0 py-3 md:py-4">
          <img src="/logo.svg" alt="INNOPROG" className="h-10" />
        </div>

        {roomId && roomPermissions && (
          <Settings
            isTeacher={isTeacher}
            onCompleteSession={onCompleteSession!}
            onPermissionsChange={onPermissionsChange!}
            roomPermissions={roomPermissions}
            completedSession={Boolean(completedSession)}
          />
        )}

        {roomId && members && members.length > 0 && (
          <div className="flex gap-4 items-center relative">
            {visibleMembers.map((member) => (
              <div
                key={member.telegramId}
                className={`border-2 p-[3px] rounded-full cursor-pointer transition-all duration-200 hover:scale-105 ${
                  member?.userColor && `border-[${member?.userColor}]`
                }`}
                style={{
                  borderColor: member?.userColor,
                }}
                onClick={() => handleMemberClick(member)}
                title={
                  member.telegramId === myTelegramId
                    ? "Нажмите чтобы изменить имя"
                    : `Участник: ${member.username || member.telegramId} ${
                        member.online ? "(онлайн)" : "(оффлайн)"
                      }`
                }
              >
                <span
                  className={`bg-[#444] h-12 w-12 flex items-center justify-center rounded-full text-white text-sm font-medium transition-opacity duration-200 ${
                    !member.online && "opacity-50"
                  }`}
                >
                  {member.username
                    ? member.username.slice(0, 2).toUpperCase()
                    : member.telegramId.slice(0, 3)}
                </span>
              </div>
            ))}

            {hasMoreMembers && (
              <Popover
                isOpen={showMembersCard}
                onOpenChange={setShowMembersCard}
              >
                <PopoverTrigger>
                  <button
                    onClick={() => setShowMembersCard(!showMembersCard)}
                    className="border-2 border-dashed border-gray-500 p-[3px] rounded-full cursor-pointer transition-all duration-200 hover:scale-105 hover:border-gray-400"
                    title={`Ещё ${sortedMembers.length - 3} участников`}
                  >
                    <span className="bg-gray-600 h-12 w-12 flex items-center justify-center rounded-full text-white text-sm font-medium hover:bg-gray-500 transition-colors duration-200">
                      <img
                        src="/icons/members.svg"
                        alt="members list"
                        className="w-5 h-5"
                      />
                    </span>
                  </button>
                </PopoverTrigger>

                <PopoverContent className={"p-3 bg-ide-background"}>
                  <div className="mb-3 w-full">
                    <h3 className="text-sm font-semibold text-ide-text-primary mb-1">
                      Участники комнаты
                    </h3>
                    <p className="text-xs text-ide-text-secondary">
                      Всего: {sortedMembers.length} • Онлайн:{" "}
                      {onlineMembers.length}
                    </p>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 w-full">
                    {sortedMembers.map((member) => (
                      <div
                        key={member.telegramId}
                        className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 cursor-pointer hover:bg-ide-editor bg-ide-secondary border border-ide-border ${
                          !member.online && "opacity-60"
                        }`}
                        onClick={() => {
                          handleMemberClick(member);
                          setShowMembersCard(false);
                        }}
                      >
                        <div
                          className="border-2 p-[2px] rounded-full"
                          style={{
                            borderColor: member?.userColor || "#666",
                          }}
                        >
                          <span
                            className={`bg-[#444] h-8 w-8 flex items-center justify-center rounded-full text-white text-xs font-medium ${
                              !member.online && "opacity-70"
                            }`}
                          >
                            {member.username
                              ? member.username.slice(0, 2).toUpperCase()
                              : member.telegramId.slice(0, 2)}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium truncate ${
                                member.online
                                  ? "text-ide-text-primary"
                                  : "text-ide-text-secondary"
                              }`}
                            >
                              {member.username ||
                                `User ${member.telegramId.slice(-4)}`}
                            </span>

                            {member.telegramId === myTelegramId && (
                              <span className="text-xs bg-ide-button-primary/30 text-ide-button-primary px-2 py-0.5 rounded border border-ide-button-primary/50">
                                Вы
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                member.online
                                  ? "bg-ide-button-primary"
                                  : "bg-gray-500"
                              }`}
                            />
                            <span className="text-xs text-ide-text-secondary">
                              {member.online ? "Онлайн" : "Оффлайн"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-ide-border flex justify-between gap-3 items-center">
                    <span className="text-xs text-ide-text-secondary">
                      Нажмите на участника для редактирования
                    </span>
                    <button
                      onClick={() => setShowMembersCard(false)}
                      className="text-xs text-ide-button-primary hover:text-ide-button-primary-hover transition-colors duration-200 hover:underline"
                    >
                      Закрыть
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </header>

      <StartFormModal
        isOpen={isOpen}
        onOpen={onOpen}
        onOpenChange={onOpenChange}
        onSendForm={handleEditSubmit}
        currentUsername={editingMember?.username || ""}
      />
    </>
  );
};

export default Header;
