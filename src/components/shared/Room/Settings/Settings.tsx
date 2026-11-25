import React from "react";
import {Button, Popover, PopoverContent, PopoverTrigger, Switch} from "@heroui/react";
import SettingsIcon from "./SettingsIcon";
import {RoomPermissions} from "../../../../types/room";

export interface SharedConsoleSetting {
    enabled: boolean;
    saving: boolean;
    onChange: (enabled: boolean) => void;
}

interface IProps {
    sharedConsole?: SharedConsoleSetting;
    onCompleteSession: () => void;
    isTeacher: boolean;
    onPermissionsChange: (permissions: RoomPermissions) => void;
    roomPermissions: RoomPermissions;
    completedSession: boolean;
}

const settingRowStyle = "flex items-center justify-between gap-3 p-3 rounded-xl bg-ide-secondary border border-ide-border hover:bg-ide-editor transition-colors";
const selectedSwitchStyle = { wrapper: "group-data-[selected=true]:bg-[#9c78ff]" };

const permissionSettings = {
    studentCursorEnabled: { label: "Курсоры студентов", description: "Указатели мыши в комнате", icon: "cursor" },
    studentSelectionEnabled: { label: "Выделения студентов", description: "Отметки всех участников", icon: "selection" },
    studentEditCodeEnabled: { label: "Редактирование кода", description: "Студенты могут менять код", icon: "edit" },
} as const;

const Settings: React.FC<IProps> = ({
                                        onCompleteSession,
                                        isTeacher,
                                        onPermissionsChange,
                                        roomPermissions,
                                        sharedConsole,
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

    return <Popover isOpen={showPermissionsCard} onOpenChange={setShowPermissionsCard}>
        <PopoverTrigger>
            <Button size="lg" aria-label="Настройки" className="h-8 min-w-8 gap-1.5 whitespace-nowrap px-2 text-sm md:min-w-0 md:h-12 md:gap-3 md:px-4 md:text-base">
                <span aria-hidden="true" className="text-[13px] leading-none md:text-lg">⚙️</span>
                <span className="room-settings-label hidden md:inline">Настройки</span>

                {/* Индикатор активных разрешений */}
                <span className="hidden bg-white/20 text-xs px-2 py-1 rounded-full md:inline">
									{Object.values(roomPermissions).filter(Boolean).length + Number(Boolean(sharedConsole?.enabled))}/
                    {Object.keys(roomPermissions).length + Number(Boolean(sharedConsole))}
								</span>
            </Button>
        </PopoverTrigger>

        <PopoverContent className="p-3 w-[350px] max-w-[calc(100vw-24px)]">
            <div className="space-y-3 w-full">
                {sharedConsole && <div aria-busy={sharedConsole.saving} className={settingRowStyle}>
                    <div className="flex min-w-0 items-center gap-3">
                        <SettingsIcon name="console" />
                        <div>
                            <div className="text-sm font-medium text-ide-text-primary">Общая консоль</div>
                            <div className="text-xs text-ide-text-secondary">Ввод и вывод для всех</div>
                        </div>
                    </div>
                    <Switch
                        aria-label="Общая консоль"
                        classNames={selectedSwitchStyle}
                        isDisabled={!isTeacher || completedSession}
                        isSelected={sharedConsole.enabled}
                        onValueChange={sharedConsole.onChange}
                    />
                </div>}
                {(Object.keys(permissionSettings) as (keyof RoomPermissions)[]).map(key => {
                    const { label, description, icon } = permissionSettings[key];
                    return <div key={key} className={settingRowStyle}>
                        <div className="flex min-w-0 items-center gap-3">
                            <SettingsIcon name={icon} />
                            <div>
                                <div className="text-sm font-medium text-ide-text-primary">{label}</div>
                                <div className="text-xs text-ide-text-secondary">{description}</div>
                            </div>
                        </div>
                        <Switch
                            aria-label={label}
                            isDisabled={!isTeacher || completedSession}
                            classNames={selectedSwitchStyle}
                            isSelected={roomPermissions[key]}
                            onValueChange={value => handlePermissionChange(key, value)}
                        />
                    </div>;
                })}
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
