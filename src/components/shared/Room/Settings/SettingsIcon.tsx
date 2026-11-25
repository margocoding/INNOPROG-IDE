import React from "react";

type SettingsIconName = "console" | "cursor" | "selection" | "edit";

const paths: Record<SettingsIconName, React.ReactNode> = {
    console: <path d="m4 6 6 6-6 6m9 0h7" />,
    cursor: <path d="m4 3 5.2 17 3.2-6.1 6.6-2.7L4 3Z" />,
    selection: <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 9h8m-4 0v7" />,
    edit: <path d="m7 7-5 5 5 5m10-10 5 5-5 5m-3-13-4 16" />,
};

export default function SettingsIcon({ name }: { name: SettingsIconName }) {
    return (
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center text-[#9c78ff]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {paths[name]}
            </svg>
        </span>
    );
}
