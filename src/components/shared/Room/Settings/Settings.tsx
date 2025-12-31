import React from "react";
import {Button, Popover, PopoverContent, PopoverTrigger, Switch} from "@heroui/react";
import {RoomPermissions} from "../../../../types/room";

interface IProps {
    onCompleteSession: () => void;
    isTeacher: boolean;
    onPermissionsChange: (permissions: RoomPermissions) => void;
    roomPermissions: RoomPermissions;
    completedSession: boolean;
}

const Settings: React.FC<IProps> = ({
                                        onCompleteSession,
                                        isTeacher,
                                        onPermissionsChange,
                                        roomPermissions,
                                        completedSession
                                    }) => {
    const [showPermissionsCard, setShowPermissionsCard] = React.useState<boolean>(false);

    const handlePermissionChange = async (permission: keyof RoomPermissions, value: boolean) => {
        if (onPermissionsChange && roomPermissions) {
            const newPermissions = {
                ...roomPermissions, [permission]: value,
            };
            onPermissionsChange(newPermissions);
        }
    };

    const permissionLabels = {
        studentCursorEnabled: "Курсоры студентов",
        studentSelectionEnabled: "Выделения студентов",
        studentEditCodeEnabled: "Редактирование кода",
    };

    const permissionIcons = {
        studentCursorEnabled: "⚡", studentSelectionEnabled: "🎯", studentEditCodeEnabled: "✏️",
    };


    return <Popover isOpen={showPermissionsCard} onOpenChange={setShowPermissionsCard}>
        <PopoverTrigger>
            <Button size={"lg"} className="min-w-0 px-2 md:px-4">
                <span className="text-base md:text-lg">⚙️</span>
                <span className="hidden md:inline">Настройки</span>

                {/* Индикатор активных разрешений */}
                <span className="bg-white/20 text-xs px-1.5 md:px-2 py-1 rounded-full">
									{Object.values(roomPermissions).filter(Boolean).length}/
                    {Object.keys(roomPermissions).length}
								</span>
            </Button>
        </PopoverTrigger>

        <PopoverContent className={'p-3 w-[350px]'}>
            <div className="space-y-3 w-full">
                {Object.entries(roomPermissions).map(([key]) => (<div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-xl bg-ide-secondary hover:bg-ide-editor transition-all duration-300 border border-ide-border`}
                >
                    <div className="flex items-center gap-3">
                                        <span className="text-lg">
                                            {permissionIcons[key as keyof RoomPermissions]}
                                        </span>
                        <span className="text-sm font-medium text-ide-text-primary">
                                            {permissionLabels[key as keyof RoomPermissions]}
                                        </span>
                    </div>

                    <Switch
                        isDisabled={!isTeacher || completedSession}
                        color="secondary"
                        isSelected={roomPermissions[key as keyof RoomPermissions]}
                        onValueChange={(value: boolean): Promise<void> => handlePermissionChange(key as keyof RoomPermissions, value)}
                    />
                </div>))}
                {isTeacher && !completedSession && (<Button
                    className="w-full disabled:opacity-60"
                    disabled={!isTeacher}
                    color="danger"
                    size="lg"
                    onPress={() => {
                        onCompleteSession();
                        setShowPermissionsCard(false);
                    }}
                >
                    Завершить сессию
                </Button>)}
            </div>
        </PopoverContent>
    </Popover>
}

export default Settings;